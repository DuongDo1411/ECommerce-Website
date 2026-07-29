import { mkdirSync, writeFileSync } from "fs";
import { isAbsolute, join, relative, resolve } from "path";

import { loadEnvLocal } from "./loadEnv";

/**
 * Dumps the `users` collection to JSON for a pre-migration safety net. The
 * output directory MUST be an absolute path OUTSIDE the repository so a backup
 * (which contains PII) is never accidentally committed. The password hash is
 * excluded — the 2FA backfill never touches it.
 *
 *   npx tsx scripts/backup-users.ts /absolute/path/outside/repo
 */
async function main() {
  const outArg = process.argv[2] ?? process.env.BACKUP_OUT_DIR;
  if (!outArg || !isAbsolute(outArg)) {
    throw new Error(
      "Provide an ABSOLUTE output directory outside the repo, e.g.\n" +
        "  npx tsx scripts/backup-users.ts D:/ecoshop-backups",
    );
  }
  const outDir = resolve(outArg);
  const rel = relative(resolve(process.cwd()), outDir);
  const insideRepo = rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  if (insideRepo) {
    throw new Error(
      "Refusing to write the backup inside the repository — choose a path outside it.",
    );
  }

  loadEnvLocal();
  const { default: mongoose } = await import("mongoose");
  const { default: connectDB } = await import("../src/lib/connectDB");
  await connectDB();

  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB connection is not ready");

  const users = await database
    .collection("users")
    .find({}, { projection: { password: 0 } })
    .toArray();

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(outDir, `users-${stamp}.json`);
  writeFileSync(file, JSON.stringify(users, null, 2), "utf8");

  console.log(`Backed up ${users.length} users (no password hash) → ${file}`);
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
