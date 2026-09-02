import { loadEnvLocal } from "./loadEnv";
import { CATEGORY_KEYS, type CategoryKey } from "./seed/categories";

/**
 * CLI cho việc bulk-seed sản phẩm demo. Bốn lệnh con:
 *
 *   inspect --target=15 --seed=<chuỗi> [--vendor=<email> ...]
 *   commit  --manifest=<path> --confirm-db=<dbName> --confirm-run=<runId>
 *   status  --run=<runId>
 *   rollback --run=<runId> --confirm-db=<dbName>
 *
 * `loadEnvLocal()` phải chạy TRƯỚC bất kỳ import nào chạm tới `connectDB` (kể cả gián tiếp) —
 * đó là lý do mọi module thật sự nối MongoDB (`./seed/inspect`, `./seed/commit`, ...) được
 * import động bên trong `main()`, không import tĩnh ở đầu tệp.
 */

type Flags = Record<string, string | string[]>;

function parseArgs(argv: string[]): { subcommand: string | undefined; flags: Flags } {
  const [subcommand, ...rest] = argv;
  const flags: Flags = {};
  for (const arg of rest) {
    const match = /^--([a-zA-Z-]+)=(.*)$/.exec(arg);
    if (!match) continue;
    const [, key, value] = match;
    const existing = flags[key];
    if (existing === undefined) {
      flags[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      flags[key] = [existing, value];
    }
  }
  return { subcommand, flags };
}

function flagString(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return Array.isArray(v) ? v[v.length - 1] : v;
}

function flagList(flags: Flags, key: string): string[] {
  const v = flags[key];
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "run";
}

function requirePexelsApiKey(): string {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    throw new Error(
      "Thiếu PEXELS_API_KEY trong .env.local. Lấy miễn phí tại https://www.pexels.com/api/ " +
        "rồi thêm dòng PEXELS_API_KEY=... vào .env.local.",
    );
  }
  return key;
}

function parseCategoryOverrides(flags: Flags): Record<string, CategoryKey> {
  const result: Record<string, CategoryKey> = {};
  for (const entry of flagList(flags, "category")) {
    const sepIndex = entry.indexOf(":");
    if (sepIndex === -1) {
      throw new Error(`--category phải có dạng <vendorId>:<DanhMục>, nhận "${entry}"`);
    }
    const vendorId = entry.slice(0, sepIndex);
    const category = entry.slice(sepIndex + 1);
    if (!(CATEGORY_KEYS as readonly string[]).includes(category)) {
      throw new Error(
        `--category="${entry}": "${category}" không phải danh mục hợp lệ. Chọn 1 trong: ${CATEGORY_KEYS.join(", ")}`,
      );
    }
    result[vendorId] = category as CategoryKey;
  }
  return result;
}

function printUsage(): void {
  console.error(
    [
      "Cách dùng:",
      "  npx tsx scripts/seed-products.ts inspect --target=15 --seed=<chuỗi> [--vendor=<email> ...] [--category=<vendorId>:<DanhMục> ...]",
      "  npx tsx scripts/seed-products.ts commit --manifest=<path> --confirm-db=<dbName> --confirm-run=<runId>",
      "  npx tsx scripts/seed-products.ts status --run=<runId>",
      "  npx tsx scripts/seed-products.ts rollback --run=<runId> --confirm-db=<dbName>",
    ].join("\n"),
  );
}

async function cmdInspect(flags: Flags): Promise<void> {
  const target = Number(flagString(flags, "target") ?? "15");
  const seed = flagString(flags, "seed");
  if (!seed) {
    throw new Error("Thiếu --seed=<chuỗi bất kỳ> — bắt buộc để manifest sinh ra xác định (reproducible).");
  }
  const vendorEmails = flagList(flags, "vendor");
  const categoryOverrides = parseCategoryOverrides(flags);
  const pexelsApiKey = requirePexelsApiKey();
  const runId = `${slugify(seed)}-${Date.now()}`;

  const { runInspect } = await import("./seed/inspect");
  const outcome = await runInspect({
    target,
    seed,
    runId,
    vendorEmails,
    pexelsApiKey,
    categoryOverrides,
  });

  console.log(`\nManifest: ${outcome.manifestFilePath}`);
  console.log(`runId: ${outcome.manifest.runId}`);
  console.log(`manifestHash: ${outcome.manifest.manifestHash}\n`);

  console.log("shop".padEnd(28) + "hiện có".padEnd(10) + "sẽ thêm".padEnd(10) + "danh mục");
  for (const vendor of outcome.manifest.vendors) {
    const flag = vendor.needsReview ? " (cần xem lại)" : "";
    console.log(
      vendor.shopName.padEnd(28) +
        String(vendor.existingApprovedActiveCount).padEnd(10) +
        String(vendor.products.length).padEnd(10) +
        vendor.category +
        flag,
    );
  }

  if (outcome.droppedVendors.length > 0) {
    console.log("\nVendor bị BỎ QUA khỏi manifest (không tìm/tải được ảnh):");
    for (const dropped of outcome.droppedVendors) {
      console.log(`  - ${dropped.shopName}: ${dropped.reason}`);
    }
  }

  const totalToAdd = outcome.manifest.vendors.reduce((sum, v) => sum + v.products.length, 0);
  console.log(`\nTổng sản phẩm sẽ tạo nếu commit: ${totalToAdd}`);
  console.log(
    "Đây CHỈ LÀ BẢN XEM TRƯỚC — chưa có gì được ghi vào MongoDB/Cloudinary.\n" +
      "Xem lại manifest, rồi chạy:\n" +
      `  npx tsx scripts/seed-products.ts commit --manifest=${outcome.manifestFilePath} ` +
      `--confirm-db=<dbName> --confirm-run=${outcome.manifest.runId}`,
  );
}

async function cmdCommit(flags: Flags): Promise<void> {
  const manifestFilePath = flagString(flags, "manifest");
  const confirmDb = flagString(flags, "confirm-db");
  const confirmRun = flagString(flags, "confirm-run");
  if (!manifestFilePath || !confirmDb || !confirmRun) {
    throw new Error("commit cần --manifest=<path> --confirm-db=<dbName> --confirm-run=<runId>");
  }

  const { loadManifest } = await import("./seed/manifest");
  const manifest = loadManifest(manifestFilePath);
  if (manifest.runId !== confirmRun) {
    throw new Error(
      `--confirm-run="${confirmRun}" không khớp runId trong manifest ("${manifest.runId}"). Dừng lại.`,
    );
  }

  const { commitManifest } = await import("./seed/commit");
  const report = await commitManifest(manifest, { confirmDb });

  console.log(`\nrunId: ${report.runId}  database: ${report.databaseName}\n`);
  let totalCreated = 0;
  for (const vendor of report.vendors) {
    totalCreated += vendor.createdCount;
    console.log(
      `  ${vendor.shopName.padEnd(28)} ${vendor.status.padEnd(18)} +${vendor.createdCount}` +
        (vendor.message ? ` — ${vendor.message}` : ""),
    );
  }
  console.log(`\nTổng sản phẩm đã tạo: ${totalCreated}`);
  console.log(`Để gỡ toàn bộ run này sau này: npx tsx scripts/seed-products.ts rollback --run=${report.runId} --confirm-db=${report.databaseName}`);
}

async function cmdStatus(flags: Flags): Promise<void> {
  const runId = flagString(flags, "run");
  if (!runId) throw new Error("status cần --run=<runId>");

  const { default: connectDB } = await import("../src/lib/connectDB");
  const { getSeedRun } = await import("./seed/seedRuns");
  await connectDB();
  const run = await getSeedRun(runId);
  if (!run) throw new Error(`Không tìm thấy run "${runId}".`);

  console.log(`runId: ${run.runId}  status: ${run.status}  database: ${run.databaseName}`);
  for (const vendor of run.vendors) {
    console.log(`  vendor ${vendor.vendorId}: ${vendor.status} (${vendor.productIds.length} sản phẩm)`);
  }
}

async function cmdRollback(flags: Flags): Promise<void> {
  const runId = flagString(flags, "run");
  const confirmDb = flagString(flags, "confirm-db");
  if (!runId || !confirmDb) throw new Error("rollback cần --run=<runId> --confirm-db=<dbName>");

  const { rollbackRun } = await import("./seed/rollback");
  const report = await rollbackRun(runId, { confirmDb });

  console.log(`\nrunId: ${report.runId}  database: ${report.databaseName}\n`);
  for (const vendor of report.vendors) {
    console.log(
      `  vendor ${vendor.vendorId}: ${vendor.status} (-${vendor.deletedProductCount})` +
        (vendor.message ? ` — ${vendor.message}` : ""),
    );
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const { subcommand, flags } = parseArgs(process.argv.slice(2));
  if (subcommand === "inspect") {
    await cmdInspect(flags);
  } else if (subcommand === "commit") {
    await cmdCommit(flags);
  } else if (subcommand === "status") {
    await cmdStatus(flags);
  } else if (subcommand === "rollback") {
    await cmdRollback(flags);
  } else {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const { default: mongoose } = await import("mongoose");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    const { default: mongoose } = await import("mongoose");
    await mongoose.disconnect();
  } catch {
    // Connection was never opened.
  }
  process.exitCode = 1;
});
