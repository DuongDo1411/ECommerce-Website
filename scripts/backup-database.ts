import { mkdirSync, writeFileSync } from "fs";
import { isAbsolute, join, relative, resolve } from "path";

import { loadEnvLocal } from "./loadEnv";

/**
 * Dump TOÀN BỘ database ra EJSON, một tệp mỗi collection, để có đường phục hồi khi cluster
 * Atlas không có sao lưu tự động — tier M0 thì không có, và một câu lệnh gõ sai là mất sạch.
 *
 *   npx tsx scripts/backup-database.ts D:/multicart-backups
 *
 * Khác backup-users.ts ở hai điểm, và cả hai đều quan trọng: nó lấy MỌI collection, và nó
 * KHÔNG loại trường password. Nên bản dump này chứa hash bcrypt, số điện thoại và địa chỉ của
 * toàn bộ người dùng. Đối xử với nó như một bản sao production, không phải một tệp tạm.
 *
 * Dùng EJSON thay vì JSON.stringify: JSON thường biến ObjectId và Date thành chuỗi, nên bản
 * dump nhìn có vẻ đầy đủ mà nạp lại thì sai kiểu ở mọi khoá ngoại và mọi mốc thời gian.
 */
async function main() {
  const outArg = process.argv[2] ?? process.env.BACKUP_OUT_DIR;
  if (!outArg || !isAbsolute(outArg)) {
    throw new Error(
      "Cần một thư mục đích dạng đường dẫn TUYỆT ĐỐI, nằm ngoài repo, ví dụ\n" +
        "  npx tsx scripts/backup-database.ts D:/multicart-backups",
    );
  }
  const outDir = resolve(outArg);

  const isInside = (parent: string, child: string) => {
    const rel = relative(resolve(parent), child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  };

  if (isInside(process.cwd(), outDir)) {
    throw new Error(
      "Không ghi bản dump vào trong repo — chứa PII, và một lần `git add -A` là nó lên GitHub.",
    );
  }

  // Thư mục OneDrive được đồng bộ tự động. Ghi bản dump vào đó là đẩy hash mật khẩu và địa chỉ
  // của toàn bộ người dùng lên máy chủ của Microsoft, mà không ai chủ ý làm việc đó.
  const oneDrive = process.env.OneDrive ?? process.env.OneDriveConsumer;
  if (oneDrive && isInside(oneDrive, outDir)) {
    throw new Error(
      `Thư mục đích nằm trong OneDrive (${oneDrive}) nên sẽ được đồng bộ lên mây.\n` +
        "Chọn một ổ không đồng bộ, ví dụ D:/multicart-backups.",
    );
  }

  loadEnvLocal();
  const { default: mongoose } = await import("mongoose");
  const { default: connectDB } = await import("../src/lib/connectDB");
  await connectDB();

  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB connection is not ready");

  const { EJSON } = mongoose.mongo.BSON;
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const dumpDir = join(outDir, `multicart-${stamp}`);
  mkdirSync(dumpDir, { recursive: true });

  const collections = (await database.listCollections().toArray()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const manifest: { collection: string; documents: number; file: string }[] = [];
  for (const info of collections) {
    // Đọc trọn collection vào bộ nhớ. Chấp nhận được ở quy mô này; nếu về sau có collection
    // hàng trăm nghìn tài liệu thì phải đổi sang ghi theo cursor.
    const docs = await database.collection(info.name).find({}).toArray();
    const file = `${info.name}.json`;
    writeFileSync(join(dumpDir, file), EJSON.stringify(docs, undefined, 2), "utf8");
    manifest.push({ collection: info.name, documents: docs.length, file });
    console.log(`${info.name.padEnd(24)} ${docs.length}`);
  }

  writeFileSync(
    join(dumpDir, "manifest.json"),
    JSON.stringify(
      {
        database: database.databaseName,
        createdAt: startedAt.toISOString(),
        collections: manifest,
      },
      null,
      2,
    ),
    "utf8",
  );

  const total = manifest.reduce((sum, entry) => sum + entry.documents, 0);
  console.log(
    `\n${collections.length} collection, ${total} tài liệu → ${dumpDir}\n` +
      "Bản dump chứa PII và hash mật khẩu: đừng commit, đừng tải lên đâu cả.",
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    const { default: mongoose } = await import("mongoose");
    await mongoose.disconnect();
  } catch {
    // Connection was never established.
  }
  process.exitCode = 1;
});
