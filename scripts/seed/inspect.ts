import connectDB from "../../src/lib/connectDB";
import Product from "../../src/model/product.model";
import User from "../../src/model/user.model";
import { APPROVED_VENDOR_FILTER } from "../../src/lib/vendorGate";

import { resolveManifestImages, type DroppedVendor } from "./images";
import { buildManifest, saveManifest, type SeedManifest, type VendorInput } from "./manifest";
import { inferVendorCategory } from "./vendorCategory";
import type { CategoryKey } from "./categories";

export interface InspectOptions {
  target: number;
  seed: string;
  runId: string;
  /** Nếu có, chỉ xét các vendor có email trong danh sách này. */
  vendorEmails?: string[];
  pexelsApiKey: string;
  /**
   * Ghi đè thủ công category cho một vendor cụ thể, theo `vendorId` (ObjectId hex). Dùng khi
   * suy luận 3 tầng của `inferVendorCategory` không đủ dữ kiện — shopName không gợi ý ngành
   * hàng nào và vendor chưa có sản phẩm approved+active nào — nên rơi vào tầng xoay vòng
   * (`needsReview: true`) và người vận hành biết ngành hàng thật của shop đó.
   */
  categoryOverrides?: Record<string, CategoryKey>;
}

export interface InspectOutcome {
  manifest: SeedManifest;
  manifestFilePath: string;
  droppedVendors: DroppedVendor[];
}

interface LeanVendor {
  _id: unknown;
  shopName?: string;
  email?: string;
}

interface LeanProduct {
  category: string;
  title: string;
}

/**
 * Chỉ đọc dữ liệu (kể cả gọi Pexels để CHỌN ảnh, không tải/upload) và ghi manifest ra đĩa —
 * tuyệt đối không ghi MongoDB hay Cloudinary.
 */
export async function runInspect(opts: InspectOptions): Promise<InspectOutcome> {
  await connectDB();

  const vendorFilter: Record<string, unknown> = { ...APPROVED_VENDOR_FILTER };
  if (opts.vendorEmails && opts.vendorEmails.length > 0) {
    vendorFilter.email = { $in: opts.vendorEmails };
  }

  const vendors = await User.find(vendorFilter)
    .select("_id shopName email")
    .lean<LeanVendor[]>();
  if (vendors.length === 0) {
    throw new Error("Không tìm thấy vendor nào đã được duyệt khớp điều kiện.");
  }

  const vendorInputs: VendorInput[] = [];
  for (let i = 0; i < vendors.length; i++) {
    const vendor = vendors[i];
    const vendorId = String(vendor._id);
    const existingProducts = await Product.find({
      vendor: vendorId,
      verificationStatus: "approved",
      isActive: true,
    })
      .select("category title")
      .lean<LeanProduct[]>();

    const existingCategories = existingProducts.map((p) => p.category);
    const existingTitles = existingProducts.map((p) => p.title);

    const override = opts.categoryOverrides?.[vendorId];
    const inference = override
      ? { category: override, needsReview: false }
      : inferVendorCategory({
          shopName: vendor.shopName,
          existingCategories,
          vendorIndex: i,
        });

    vendorInputs.push({
      vendorId,
      shopName: vendor.shopName ?? "(chưa đặt tên shop)",
      existingApprovedActiveCount: existingProducts.length,
      existingCategories,
      existingTitles,
      category: inference.category,
      needsReview: inference.needsReview,
    });
  }

  const manifest = buildManifest({
    seed: opts.seed,
    target: opts.target,
    vendors: vendorInputs,
    runId: opts.runId,
  });

  const { manifest: withImages, droppedVendors } = await resolveManifestImages(
    manifest,
    opts.pexelsApiKey,
  );

  const manifestFilePath = saveManifest(withImages);
  return { manifest: withImages, manifestFilePath, droppedVendors };
}
