import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  CATEGORY_CONFIG,
  CLOTHING_SIZES,
  SHOE_SIZES,
  type CategoryKey,
  type ProductTemplate,
} from "./categories";
import { rngFromString, rngInt, rngBool } from "./prng";

export const MANIFEST_DIR = path.resolve(process.cwd(), "scripts/.seed-manifests");
export const MAX_TARGET = 20;
export const MAX_PRODUCTS_PER_RUN = 100;

export interface ManifestImageInfo {
  keyword: string;
  /** Resolved by a separate Pexels-lookup pass (`resolveManifestImages`); null until then. */
  sourcePageUrl: string | null;
  photographer: string | null;
  license: string | null;
  /**
   * The actual downloadable asset URL Pexels returned alongside `sourcePageUrl` (the human-facing
   * page link). Without pinning this at inspect time, commit would have to re-query Pexels by
   * keyword and could get a DIFFERENT top result than what inspect showed the user — breaking the
   * guarantee that the manifest is what actually gets created.
   */
  downloadUrl: string | null;
  /** Deterministic — computable without any network call, so it can exist before image lookup. */
  cloudinaryPublicId: string;
}

export interface ManifestProduct {
  productId: string;
  title: string;
  description: string;
  price: number;
  category: CategoryKey;
  isWearable: boolean;
  sizeStock: { size: string; stock: number }[];
  stock: number;
  isStockAvailable: boolean;
  detailsPoints: string[];
  replacementDays: number;
  warranty: string;
  freeDelivery: boolean;
  payOnDelivery: boolean;
  weight: number;
  length: number;
  width: number;
  height: number;
  image: ManifestImageInfo;
}

export interface ManifestVendor {
  vendorId: string;
  shopName: string;
  existingApprovedActiveCount: number;
  toAdd: number;
  category: CategoryKey;
  needsReview: boolean;
  products: ManifestProduct[];
}

export interface SeedManifest {
  runId: string;
  seed: string;
  target: number;
  generatedAt: string;
  manifestHash: string;
  vendors: ManifestVendor[];
}

/** Round to the nearest 1,000₫ — matches how VND retail prices are normally written. */
function roundPriceVnd(value: number): number {
  return Math.round(value / 1000) * 1000;
}

function pickSizeStock(
  rng: () => number,
  sizeKind: "clothing" | "shoe" | undefined,
): { size: string; stock: number }[] {
  if (!sizeKind) return [];
  const sizes = sizeKind === "clothing" ? CLOTHING_SIZES : SHOE_SIZES;
  return sizes.map((size) => ({ size, stock: rngInt(rng, 3, 40) }));
}

function pickUnusedTemplates(
  templates: readonly ProductTemplate[],
  existingTitles: Set<string>,
  count: number,
  rng: () => number,
): { template: ProductTemplate; suffix: string | null }[] {
  // Deterministic shuffle (Fisher–Yates driven by the seeded RNG) so which templates get picked
  // — and in what order — is reproducible, not just which SET of templates gets picked.
  const pool = [...templates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const result: { template: ProductTemplate; suffix: string | null }[] = [];
  const usedNames = new Set(existingTitles);
  let round = 0;
  while (result.length < count) {
    const template = pool[result.length % pool.length];
    // First pass through the pool: no suffix. Once the pool is exhausted (rare — only 15 templates
    // needed against a max target of 20), add a numbered variant suffix to keep names unique.
    round = Math.floor(result.length / pool.length);
    const suffix = round === 0 ? null : `Phiên bản ${round + 1}`;
    const candidateName = suffix ? `${template.name} - ${suffix}` : template.name;
    if (!usedNames.has(candidateName)) {
      usedNames.add(candidateName);
      result.push({ template, suffix });
    } else if (round > 5) {
      // Safety valve — should be unreachable given MAX_TARGET=20 and >=15 templates/category.
      throw new Error("pickUnusedTemplates: could not find enough unique names");
    } else {
      // Force progress even on a collision by nudging the round forward for this slot.
      result.push({ template, suffix: `Phiên bản ${round + 2}` });
    }
  }
  return result;
}

function buildManifestProduct(
  category: CategoryKey,
  template: ProductTemplate,
  suffix: string | null,
  seedKey: string,
  productIndex: number,
): ManifestProduct {
  const config = CATEGORY_CONFIG[category];
  const rng = rngFromString(`${seedKey}:product:${productIndex}`);
  const title = suffix ? `${template.name} - ${suffix}` : template.name;

  const sizeStock = pickSizeStock(rng, template.isWearable ? template.sizeKind : undefined);
  const stock = sizeStock.length > 0
    ? sizeStock.reduce((sum, s) => sum + s.stock, 0)
    : rngInt(rng, 10, 150);

  const price = roundPriceVnd(rngInt(rng, config.priceRange[0], config.priceRange[1]));
  const weight = rngInt(rng, config.weightRangeG[0], config.weightRangeG[1]);
  const length = rngInt(rng, config.lengthRangeCm[0], config.lengthRangeCm[1]);
  const width = rngInt(rng, config.widthRangeCm[0], config.widthRangeCm[1]);
  const height = rngInt(rng, config.heightRangeCm[0], config.heightRangeCm[1]);
  const replacementDays = rngInt(rng, config.replacementDaysRange[0], config.replacementDaysRange[1]);
  const freeDelivery = rngBool(rng, config.freeDeliveryChance);
  const payOnDelivery = rngBool(rng, config.payOnDeliveryChance);

  // Deterministic 12-byte ObjectId, built from the same RNG stream so re-running with an
  // unchanged seed/input reproduces the exact same _id — required for the manifest to be a
  // faithful, replayable description of what `commit` will insert.
  const objectIdHex = Array.from({ length: 24 }, () =>
    Math.floor(rng() * 16).toString(16),
  ).join("");

  return {
    productId: objectIdHex,
    title,
    description: config.description(title),
    price,
    category,
    isWearable: template.isWearable,
    sizeStock,
    stock,
    isStockAvailable: stock > 0,
    detailsPoints: config.detailPoints(title),
    replacementDays,
    warranty: config.warranty,
    freeDelivery,
    payOnDelivery,
    weight,
    length,
    width,
    height,
    image: {
      keyword: template.imageKeyword,
      sourcePageUrl: null,
      photographer: null,
      license: null,
      downloadUrl: null,
      // Cố tình KHÔNG nhúng runId vào đây: runId có timestamp để mỗi lần `inspect` là một bản
      // ghi riêng trong `seed_runs`, nhưng nếu public ID phụ thuộc runId thì nội dung manifest
      // (và do đó manifestHash) sẽ đổi mỗi lần chạy dù cùng seed — vi phạm chính yêu cầu
      // "cùng seed cho ra cùng manifest" của kế hoạch. `seed_runs` đã ghi rõ publicId nào thuộc
      // run nào, nên rollback không cần runId xuất hiện trong chuỗi path này.
      cloudinaryPublicId: `multicart/demo-seed/${objectIdHex}`,
    },
  };
}

export interface VendorInput {
  vendorId: string;
  shopName: string;
  existingApprovedActiveCount: number;
  existingCategories: string[];
  existingTitles: string[];
  category: CategoryKey;
  needsReview: boolean;
}

/**
 * Sinh manifest — thuần hàm, không gọi mạng. Ảnh (`sourcePageUrl`/`photographer`/`license`)
 * được điền sau bởi `resolveManifestImages`, vì đó là bước duy nhất cần gọi Pexels.
 */
export function buildManifest(params: {
  seed: string;
  target: number;
  vendors: VendorInput[];
  runId: string;
  generatedAt?: string;
}): SeedManifest {
  const { seed, target, vendors, runId } = params;
  const generatedAt = params.generatedAt ?? new Date().toISOString();

  if (target < 1 || target > MAX_TARGET) {
    throw new Error(`target phải trong khoảng 1..${MAX_TARGET}, nhận được ${target}`);
  }

  const manifestVendors: ManifestVendor[] = vendors.map((vendor) => {
    const toAdd = Math.max(0, target - vendor.existingApprovedActiveCount);
    const config = CATEGORY_CONFIG[vendor.category];
    const seedKey = `${seed}:${vendor.vendorId}`;
    const chosen =
      toAdd === 0
        ? []
        : pickUnusedTemplates(
            config.templates,
            new Set(vendor.existingTitles),
            toAdd,
            rngFromString(`${seedKey}:pick`),
          );

    const products = chosen.map(({ template, suffix }, index) =>
      buildManifestProduct(vendor.category, template, suffix, seedKey, index),
    );

    return {
      vendorId: vendor.vendorId,
      shopName: vendor.shopName,
      existingApprovedActiveCount: vendor.existingApprovedActiveCount,
      toAdd,
      category: vendor.category,
      needsReview: vendor.needsReview,
      products,
    };
  });

  const totalProducts = manifestVendors.reduce((sum, v) => sum + v.products.length, 0);
  if (totalProducts > MAX_PRODUCTS_PER_RUN) {
    throw new Error(
      `Một lần chạy tạo ${totalProducts} sản phẩm, vượt giới hạn ${MAX_PRODUCTS_PER_RUN}. ` +
        `Chia nhỏ bằng --vendor để chạy nhiều manifest.`,
    );
  }

  const manifestHash = hashManifestContent({ seed, target, vendors: manifestVendors });

  return { runId, seed, target, generatedAt, manifestHash, vendors: manifestVendors };
}

/**
 * `JSON.stringify(value, arrayOfKeys)` only keeps keys that appear in that array, and it applies
 * the SAME restriction recursively at every nesting level — so a naive `Object.keys(content)`
 * replacer would silently drop every nested vendor/product field, since none of their key names
 * (`vendorId`, `title`, `price`, ...) are in the top-level key list. This sorts object keys at
 * every level instead, so nested field order doesn't affect the hash, without dropping any data.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
  );
  return `{${entries.join(",")}}`;
}

/** Hash chỉ tính trên nội dung xác định (không gồm `runId`/`generatedAt`) để hai lần build với
 *  cùng seed + cùng dữ liệu đầu vào (kể cả khi chạy ở hai thời điểm khác nhau) ra cùng một hash. */
export function hashManifestContent(content: {
  seed: string;
  target: number;
  vendors: ManifestVendor[];
}): string {
  return crypto.createHash("sha256").update(stableStringify(content)).digest("hex");
}

export function manifestPath(runId: string): string {
  return path.join(MANIFEST_DIR, `${runId}.json`);
}

export function saveManifest(manifest: SeedManifest): string {
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });
  const filePath = manifestPath(manifest.runId);
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), "utf8");
  return filePath;
}

export function loadManifest(filePath: string): SeedManifest {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as SeedManifest;
}

/** Manifest hiện tại vẫn khớp với chính nó (chưa bị sửa tay sau khi `inspect` tạo ra). */
export function verifyManifestIntegrity(manifest: SeedManifest): boolean {
  const recomputed = hashManifestContent({
    seed: manifest.seed,
    target: manifest.target,
    vendors: manifest.vendors,
  });
  return recomputed === manifest.manifestHash;
}
