import mongoose from "mongoose";

import connectDB from "../../src/lib/connectDB";
import Product from "../../src/model/product.model";
import User from "../../src/model/user.model";
import { APPROVED_VENDOR_FILTER } from "../../src/lib/vendorGate";

import {
  deleteProductImage,
  downloadAndValidateImage,
  uploadProductImage,
  type ProductImageUrls,
} from "./images";
import { verifyManifestIntegrity, type ManifestVendor, type SeedManifest } from "./manifest";
import {
  ensureSeedRunHeader,
  ensureSeedRunsIndexes,
  getVendorEntry,
  setRunStatus,
  upsertVendorEntry,
} from "./seedRuns";

export interface CommitVendorResult {
  vendorId: string;
  shopName: string;
  status: "committed" | "already_committed" | "skipped" | "failed";
  createdCount: number;
  message?: string;
}

export interface CommitReport {
  runId: string;
  databaseName: string;
  vendors: CommitVendorResult[];
}

/**
 * Commit một manifest. Idempotent theo vendor: gọi lại với cùng manifest chỉ tiếp tục các vendor
 * chưa `committed` trong `seed_runs`, không tạo trùng dữ liệu cho vendor đã xong.
 */
export async function commitManifest(
  manifest: SeedManifest,
  opts: { confirmDb: string },
): Promise<CommitReport> {
  if (!verifyManifestIntegrity(manifest)) {
    throw new Error(
      "Manifest đã bị sửa sau khi tạo (hash không khớp) — không commit. Chạy lại inspect.",
    );
  }

  await connectDB();
  await ensureSeedRunsIndexes();

  const actualDbName = mongoose.connection.db?.databaseName;
  if (!actualDbName || actualDbName !== opts.confirmDb) {
    throw new Error(
      `--confirm-db="${opts.confirmDb}" không khớp database đang kết nối ` +
        `("${actualDbName ?? "không xác định"}"). Dừng lại, không ghi gì.`,
    );
  }

  await ensureSeedRunHeader({
    runId: manifest.runId,
    manifestHash: manifest.manifestHash,
    databaseName: actualDbName,
    seed: manifest.seed,
    target: manifest.target,
  });

  const results: CommitVendorResult[] = [];
  for (const vendor of manifest.vendors) {
    results.push(await commitVendor(manifest.runId, vendor));
  }

  const anyFailed = results.some((r) => r.status === "failed");
  await setRunStatus(manifest.runId, anyFailed ? "partially_committed" : "committed", {
    committedAt: new Date(),
  });

  return { runId: manifest.runId, databaseName: actualDbName, vendors: results };
}

async function commitVendor(
  runId: string,
  vendorManifest: ManifestVendor,
): Promise<CommitVendorResult> {
  const base = { vendorId: vendorManifest.vendorId, shopName: vendorManifest.shopName };

  if (vendorManifest.products.length === 0) {
    return { ...base, status: "skipped", createdCount: 0, message: "Không có sản phẩm cần thêm." };
  }

  const existingEntry = await getVendorEntry(runId, vendorManifest.vendorId);
  if (existingEntry?.status === "committed") {
    return { ...base, status: "already_committed", createdCount: existingEntry.productIds.length };
  }

  // Bước 1 — vendor vẫn approved, số lượng hiện có chưa đổi kể từ lúc inspect.
  const vendorDoc = await User.findOne({ _id: vendorManifest.vendorId, ...APPROVED_VENDOR_FILTER })
    .select("_id")
    .lean();
  if (!vendorDoc) {
    await upsertVendorEntry(runId, {
      vendorId: vendorManifest.vendorId,
      productIds: [],
      cloudinaryPublicIds: [],
      status: "failed",
    });
    return {
      ...base,
      status: "failed",
      createdCount: 0,
      message: "Vendor không còn ở trạng thái approved — bỏ qua.",
    };
  }

  const currentCount = await Product.countDocuments({
    vendor: vendorManifest.vendorId,
    verificationStatus: "approved",
    isActive: true,
  });
  if (currentCount !== vendorManifest.existingApprovedActiveCount) {
    return {
      ...base,
      status: "failed",
      createdCount: 0,
      message:
        `Số sản phẩm hiện có đã đổi từ lúc inspect ` +
        `(${vendorManifest.existingApprovedActiveCount} -> ${currentCount}). Chạy lại inspect.`,
    };
  }

  // Bước 2 — tải + kiểm + upload TOÀN BỘ ảnh của vendor này trước khi đụng tới MongoDB.
  const uploadedPublicIds: string[] = [];
  const imageUrlsByProductId = new Map<string, ProductImageUrls>();
  try {
    for (const product of vendorManifest.products) {
      if (!product.image.downloadUrl) {
        throw new Error(`Sản phẩm "${product.title}" chưa có ảnh nguồn — chạy lại inspect.`);
      }
      const downloaded = await downloadAndValidateImage(product.image.downloadUrl);
      const urls = await uploadProductImage(downloaded, product.image.cloudinaryPublicId);
      uploadedPublicIds.push(product.image.cloudinaryPublicId);
      imageUrlsByProductId.set(product.productId, urls);
    }
  } catch (error) {
    await Promise.allSettled(uploadedPublicIds.map((id) => deleteProductImage(id)));
    const message = error instanceof Error ? error.message : String(error);
    await upsertVendorEntry(runId, {
      vendorId: vendorManifest.vendorId,
      productIds: [],
      cloudinaryPublicIds: [],
      status: "failed",
    });
    return { ...base, status: "failed", createdCount: 0, message: `Chọn/upload ảnh thất bại: ${message}` };
  }

  // Bước 3-6 — insert Product + $addToSet vendorProducts trong một transaction Mongoose.
  const session = await mongoose.startSession();
  const productIds = vendorManifest.products.map((p) => p.productId);
  try {
    await session.withTransaction(async () => {
      const docs = vendorManifest.products.map((p) => {
        const urls = imageUrlsByProductId.get(p.productId);
        if (!urls) throw new Error(`Thiếu URL ảnh đã upload cho sản phẩm "${p.title}"`);
        return {
          _id: new mongoose.Types.ObjectId(p.productId),
          title: p.title,
          description: p.description,
          price: p.price,
          stock: p.stock,
          isStockAvailable: p.isStockAvailable,
          vendor: new mongoose.Types.ObjectId(vendorManifest.vendorId),
          image1: urls.image1,
          image2: urls.image2,
          image3: urls.image3,
          image4: urls.image4,
          category: p.category,
          isWearable: p.isWearable,
          size: p.sizeStock.map((s) => s.size),
          sizeStock: p.sizeStock,
          verificationStatus: "approved" as const,
          requestedAt: new Date(),
          approvedAt: new Date(),
          isActive: true,
          replacementDays: p.replacementDays,
          freeDelivery: p.freeDelivery,
          warranty: p.warranty,
          payOnDelivery: p.payOnDelivery,
          weight: p.weight,
          length: p.length,
          width: p.width,
          height: p.height,
          detailsPoints: p.detailsPoints,
        };
      });

      await Product.insertMany(docs, { session, ordered: true });
      await User.updateOne(
        { _id: vendorManifest.vendorId },
        { $addToSet: { vendorProducts: { $each: docs.map((d) => d._id) } } },
        { session },
      );
    });
  } catch (error) {
    await Promise.allSettled(uploadedPublicIds.map((id) => deleteProductImage(id)));
    const message = error instanceof Error ? error.message : String(error);
    await upsertVendorEntry(runId, {
      vendorId: vendorManifest.vendorId,
      productIds: [],
      cloudinaryPublicIds: [],
      status: "failed",
    });
    return { ...base, status: "failed", createdCount: 0, message: `Ghi MongoDB thất bại: ${message}` };
  } finally {
    await session.endSession();
  }

  await upsertVendorEntry(runId, {
    vendorId: vendorManifest.vendorId,
    productIds,
    cloudinaryPublicIds: uploadedPublicIds,
    status: "committed",
  });

  return { ...base, status: "committed", createdCount: productIds.length };
}
