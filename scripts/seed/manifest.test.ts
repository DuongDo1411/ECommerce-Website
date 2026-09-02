import { describe, expect, it } from "vitest";

import { CATEGORY_CONFIG } from "./categories";
import {
  MAX_PRODUCTS_PER_RUN,
  MAX_TARGET,
  buildManifest,
  hashManifestContent,
  verifyManifestIntegrity,
  type VendorInput,
} from "./manifest";

function vendor(overrides: Partial<VendorInput> = {}): VendorInput {
  return {
    vendorId: "v1",
    shopName: "Shop Test",
    existingApprovedActiveCount: 0,
    existingCategories: [],
    existingTitles: [],
    category: "Fashion & Lifestyle",
    needsReview: false,
    ...overrides,
  };
}

describe("buildManifest — xác định (deterministic)", () => {
  it("cùng seed + cùng dữ liệu đầu vào cho ra cùng manifestHash", () => {
    const params = { seed: "test-seed", target: 15, vendors: [vendor()] };
    const a = buildManifest({ ...params, runId: "run-a" });
    const b = buildManifest({ ...params, runId: "run-b", generatedAt: "2099-01-01T00:00:00.000Z" });

    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.vendors[0].products.map((p) => p.title)).toEqual(
      b.vendors[0].products.map((p) => p.title),
    );
    expect(a.vendors[0].products.map((p) => p.productId)).toEqual(
      b.vendors[0].products.map((p) => p.productId),
    );
  });

  it("seed khác nhau cho ra manifestHash khác nhau", () => {
    const a = buildManifest({ seed: "seed-a", target: 15, vendors: [vendor()], runId: "r" });
    const b = buildManifest({ seed: "seed-b", target: 15, vendors: [vendor()], runId: "r" });
    expect(a.manifestHash).not.toBe(b.manifestHash);
  });

  it("hashManifestContent tính trên toàn bộ nội dung lồng nhau, không chỉ key cấp cao nhất", () => {
    const content = { seed: "s", target: 15, vendors: [] as never[] };
    const withProduct = {
      seed: "s",
      target: 15,
      vendors: [
        {
          vendorId: "v1",
          shopName: "A",
          existingApprovedActiveCount: 0,
          toAdd: 1,
          category: "Fashion & Lifestyle" as const,
          needsReview: false,
          products: [
            {
              productId: "x".repeat(24),
              title: "Áo thun",
              description: "d",
              price: 100000,
              category: "Fashion & Lifestyle" as const,
              isWearable: false,
              sizeStock: [],
              stock: 10,
              isStockAvailable: true,
              detailsPoints: [],
              replacementDays: 7,
              warranty: "w",
              freeDelivery: false,
              payOnDelivery: false,
              weight: 100,
              length: 10,
              width: 10,
              height: 10,
              image: {
                keyword: "k",
                sourcePageUrl: null,
                photographer: null,
                license: null,
                downloadUrl: null,
                cloudinaryPublicId: "id",
              },
            },
          ],
        },
      ],
    };
    // Nếu hash bỏ sót field lồng sâu thì đổi giá sản phẩm sẽ KHÔNG đổi hash — đây là bug đã gặp
    // và sửa khi viết `stableStringify`; test này khóa lại hành vi đúng.
    const hashEmpty = hashManifestContent(content);
    const hashWithProduct = hashManifestContent(withProduct);
    expect(hashEmpty).not.toBe(hashWithProduct);

    const mutated = JSON.parse(JSON.stringify(withProduct));
    mutated.vendors[0].products[0].price = 999999;
    expect(hashManifestContent(mutated)).not.toBe(hashManifestContent(withProduct));
  });

  it("verifyManifestIntegrity đúng cho manifest chưa sửa, sai sau khi sửa tay", () => {
    const manifest = buildManifest({ seed: "s", target: 15, vendors: [vendor()], runId: "r" });
    expect(verifyManifestIntegrity(manifest)).toBe(true);

    const tampered = JSON.parse(JSON.stringify(manifest));
    tampered.vendors[0].products[0].price = tampered.vendors[0].products[0].price + 1;
    expect(verifyManifestIntegrity(tampered)).toBe(false);
  });
});

describe("buildManifest — tính toAdd theo target", () => {
  it("shop có 4 sản phẩm, target 15 -> thêm đúng 11", () => {
    const manifest = buildManifest({
      seed: "s",
      target: 15,
      vendors: [vendor({ existingApprovedActiveCount: 4 })],
      runId: "r",
    });
    expect(manifest.vendors[0].toAdd).toBe(11);
    expect(manifest.vendors[0].products).toHaveLength(11);
  });

  it("shop có >= 15 sản phẩm, target 15 -> không thêm gì", () => {
    for (const existing of [15, 20]) {
      const manifest = buildManifest({
        seed: "s",
        target: 15,
        vendors: [vendor({ existingApprovedActiveCount: existing, vendorId: `v-${existing}` })],
        runId: "r",
      });
      expect(manifest.vendors[0].toAdd, `existing=${existing}`).toBe(0);
      expect(manifest.vendors[0].products, `existing=${existing}`).toHaveLength(0);
    }
  });

  it("target ngoài khoảng 1..20 bị từ chối", () => {
    expect(() => buildManifest({ seed: "s", target: 0, vendors: [vendor()], runId: "r" })).toThrow();
    expect(() =>
      buildManifest({ seed: "s", target: MAX_TARGET + 1, vendors: [vendor()], runId: "r" }),
    ).toThrow();
  });

  it("vượt quá MAX_PRODUCTS_PER_RUN bị từ chối", () => {
    const manyVendors = Array.from({ length: 10 }, (_, i) =>
      vendor({ vendorId: `v${i}`, existingApprovedActiveCount: 0 }),
    );
    // 10 vendor x 15 sản phẩm mỗi vendor (target=15, existing=0) = 150 > MAX_PRODUCTS_PER_RUN (100)
    expect(() => buildManifest({ seed: "s", target: 15, vendors: manyVendors, runId: "r" })).toThrow(
      new RegExp(String(MAX_PRODUCTS_PER_RUN)),
    );
  });
});

describe("buildManifest — dữ liệu sản phẩm sinh ra", () => {
  it("stock = tổng sizeStock cho sản phẩm có size, không âm", () => {
    const manifest = buildManifest({
      seed: "s",
      target: 15,
      vendors: [vendor({ category: "Fashion & Lifestyle" })],
      runId: "r",
    });
    for (const product of manifest.vendors[0].products) {
      expect(product.stock).toBeGreaterThanOrEqual(0);
      if (product.sizeStock.length > 0) {
        const sum = product.sizeStock.reduce((s, x) => s + x.stock, 0);
        expect(product.stock).toBe(sum);
        for (const entry of product.sizeStock) {
          expect(entry.stock).toBeGreaterThanOrEqual(0);
        }
      }
      expect(product.isStockAvailable).toBe(product.stock > 0);
    }
  });

  it("target=20 với vendor chưa có sản phẩm nào vẫn sinh đủ 20 tên KHÔNG trùng", () => {
    const manifest = buildManifest({
      seed: "s",
      target: 20,
      vendors: [vendor({ category: "Books & Stationery" })], // pool này có 15 template
      runId: "r",
    });
    const titles = manifest.vendors[0].products.map((p) => p.title);
    expect(titles).toHaveLength(20);
    expect(new Set(titles).size).toBe(20);
  });

  it("không trùng tên với sản phẩm đã có sẵn của vendor đó", () => {
    const config = CATEGORY_CONFIG["Books & Stationery"];
    const alreadyUsed = config.templates.slice(0, 5).map((t) => t.name);
    const manifest = buildManifest({
      seed: "s",
      target: 15,
      vendors: [
        vendor({
          category: "Books & Stationery",
          existingApprovedActiveCount: 5,
          existingTitles: alreadyUsed,
        }),
      ],
      runId: "r",
    });
    const newTitles = manifest.vendors[0].products.map((p) => p.title);
    for (const used of alreadyUsed) {
      expect(newTitles).not.toContain(used);
    }
  });

  it("productId là ObjectId hex hợp lệ (24 ký tự hex)", () => {
    const manifest = buildManifest({ seed: "s", target: 15, vendors: [vendor()], runId: "r" });
    for (const product of manifest.vendors[0].products) {
      expect(product.productId).toMatch(/^[0-9a-f]{24}$/);
    }
  });
});
