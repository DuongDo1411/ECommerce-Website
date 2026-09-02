import mongoose from "mongoose";

/**
 * Collection vận hành `seed_runs`, dùng MongoDB driver gốc (qua `mongoose.connection.db`) chứ
 * không phải một Mongoose model — đây là sổ theo dõi tiến trình chạy script, không phải dữ liệu
 * nghiệp vụ của ứng dụng, nên không cần/nên có trong `src/model/`.
 */
const COLLECTION_NAME = "seed_runs";

export type VendorRunStatus =
  | "pending"
  | "committed"
  | "failed"
  | "rolled_back"
  | "cleanup_pending";

export type RunStatus =
  | "pending"
  | "in_progress"
  | "committed"
  | "partially_committed"
  | "rolled_back";

export interface SeedRunVendorRecord {
  vendorId: string;
  productIds: string[];
  cloudinaryPublicIds: string[];
  status: VendorRunStatus;
}

export interface SeedRunRecord {
  runId: string;
  manifestHash: string;
  databaseName: string;
  seed: string;
  target: number;
  status: RunStatus;
  vendors: SeedRunVendorRecord[];
  createdAt: Date;
  committedAt?: Date;
  rolledBackAt?: Date;
}

function collection() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongoose chưa kết nối — gọi connectDB() trước khi dùng seedRuns.");
  return db.collection<SeedRunRecord>(COLLECTION_NAME);
}

export async function ensureSeedRunsIndexes(): Promise<void> {
  await collection().createIndex({ runId: 1 }, { unique: true });
}

export async function getSeedRun(runId: string): Promise<SeedRunRecord | null> {
  return collection().findOne({ runId });
}

/** Tạo bản ghi run nếu chưa có; không ghi đè nếu đã tồn tại (idempotent theo `runId`). */
export async function ensureSeedRunHeader(header: {
  runId: string;
  manifestHash: string;
  databaseName: string;
  seed: string;
  target: number;
}): Promise<void> {
  await collection().updateOne(
    { runId: header.runId },
    {
      $setOnInsert: {
        ...header,
        status: "in_progress" as RunStatus,
        vendors: [],
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}

export async function getVendorEntry(
  runId: string,
  vendorId: string,
): Promise<SeedRunVendorRecord | null> {
  const run = await getSeedRun(runId);
  return run?.vendors.find((v) => v.vendorId === vendorId) ?? null;
}

/** Thêm hoặc cập nhật đúng một phần tử trong mảng `vendors` theo `vendorId`. */
export async function upsertVendorEntry(
  runId: string,
  vendor: SeedRunVendorRecord,
): Promise<void> {
  const result = await collection().updateOne(
    { runId, "vendors.vendorId": vendor.vendorId },
    {
      $set: {
        "vendors.$.productIds": vendor.productIds,
        "vendors.$.cloudinaryPublicIds": vendor.cloudinaryPublicIds,
        "vendors.$.status": vendor.status,
      },
    },
  );
  if (result.matchedCount === 0) {
    await collection().updateOne({ runId }, { $push: { vendors: vendor } });
  }
}

export async function setRunStatus(
  runId: string,
  status: RunStatus,
  extra?: Partial<Pick<SeedRunRecord, "committedAt" | "rolledBackAt">>,
): Promise<void> {
  await collection().updateOne({ runId }, { $set: { status, ...extra } });
}
