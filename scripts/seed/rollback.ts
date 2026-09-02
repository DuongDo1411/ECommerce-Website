import mongoose from "mongoose";

import connectDB from "../../src/lib/connectDB";
import Product from "../../src/model/product.model";
import User from "../../src/model/user.model";

import { deleteProductImage } from "./images";
import { getSeedRun, setRunStatus, upsertVendorEntry, type SeedRunVendorRecord } from "./seedRuns";

export interface RollbackVendorResult {
  vendorId: string;
  status: "rolled_back" | "already_rolled_back" | "cleanup_pending" | "skipped" | "failed";
  deletedProductCount: number;
  message?: string;
}

export interface RollbackReport {
  runId: string;
  databaseName: string;
  vendors: RollbackVendorResult[];
}

/**
 * Gỡ toàn bộ dữ liệu của một run đã commit. Chỉ động tới đúng `productIds`/`cloudinaryPublicIds`
 * đã ghi trong `seed_runs` cho run này — không bao giờ chạm sản phẩm có trước lần seed.
 */
export async function rollbackRun(
  runId: string,
  opts: { confirmDb: string },
): Promise<RollbackReport> {
  await connectDB();

  const actualDbName = mongoose.connection.db?.databaseName;
  if (!actualDbName || actualDbName !== opts.confirmDb) {
    throw new Error(
      `--confirm-db="${opts.confirmDb}" không khớp database đang kết nối ` +
        `("${actualDbName ?? "không xác định"}"). Dừng lại, không xóa gì.`,
    );
  }

  const run = await getSeedRun(runId);
  if (!run) throw new Error(`Không tìm thấy run "${runId}" trong seed_runs.`);
  if (run.databaseName !== actualDbName) {
    throw new Error(
      `Run "${runId}" được ghi cho database "${run.databaseName}", không phải "${actualDbName}". Dừng lại.`,
    );
  }

  const results: RollbackVendorResult[] = [];
  for (const vendorEntry of run.vendors) {
    results.push(await rollbackVendor(runId, vendorEntry));
  }

  const anyPending = results.some((r) => r.status === "cleanup_pending" || r.status === "failed");
  if (!anyPending) {
    await setRunStatus(runId, "rolled_back", { rolledBackAt: new Date() });
  }

  return { runId, databaseName: actualDbName, vendors: results };
}

async function rollbackVendor(
  runId: string,
  vendorEntry: SeedRunVendorRecord,
): Promise<RollbackVendorResult> {
  if (vendorEntry.status === "rolled_back") {
    return { vendorId: vendorEntry.vendorId, status: "already_rolled_back", deletedProductCount: 0 };
  }
  if (vendorEntry.status !== "committed" && vendorEntry.status !== "cleanup_pending") {
    return {
      vendorId: vendorEntry.vendorId,
      status: "skipped",
      deletedProductCount: 0,
      message: `Trạng thái vendor là "${vendorEntry.status}", không có gì để rollback.`,
    };
  }

  const objectIds = vendorEntry.productIds.map((id) => new mongoose.Types.ObjectId(id));
  const session = await mongoose.startSession();
  let deletedCount = 0;
  try {
    await session.withTransaction(async () => {
      const deleteResult = await Product.deleteMany({ _id: { $in: objectIds } }, { session });
      deletedCount = deleteResult.deletedCount ?? 0;
      await User.updateOne(
        { _id: vendorEntry.vendorId },
        { $pull: { vendorProducts: { $in: objectIds } } },
        { session },
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      vendorId: vendorEntry.vendorId,
      status: "failed",
      deletedProductCount: 0,
      message: `Xóa MongoDB thất bại: ${message}`,
    };
  } finally {
    await session.endSession();
  }

  const cloudinaryResults = await Promise.allSettled(
    vendorEntry.cloudinaryPublicIds.map((id) => deleteProductImage(id)),
  );
  const anyCloudinaryFailed = cloudinaryResults.some((r) => r.status === "rejected");
  const newStatus = anyCloudinaryFailed ? "cleanup_pending" : "rolled_back";

  await upsertVendorEntry(runId, {
    vendorId: vendorEntry.vendorId,
    productIds: vendorEntry.productIds,
    cloudinaryPublicIds: vendorEntry.cloudinaryPublicIds,
    status: newStatus,
  });

  return {
    vendorId: vendorEntry.vendorId,
    status: newStatus,
    deletedProductCount: deletedCount,
    message: anyCloudinaryFailed
      ? "Xóa MongoDB xong, một số ảnh Cloudinary xóa lỗi — chạy lại rollback để dọn tiếp."
      : undefined,
  };
}
