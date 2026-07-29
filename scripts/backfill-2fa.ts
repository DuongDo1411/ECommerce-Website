import { loadEnvLocal } from "./loadEnv";

/**
 * Backfills the auth fields the 2FA/session code needs onto every existing
 * account, WITHOUT deleting anything and WITHOUT faking email verification.
 *
 * Sets (only when missing): emailNormalized, sessionVersion=0,
 * twoFactorEnabled=false. Admins are always reconciled to twoFactorEnabled=false
 * (admin is excluded from 2FA). It deliberately never sets emailVerifiedAt — that
 * is earned by a real OTP round-trip — and never touches role/vendor fields.
 *
 * Dry-run by default; pass --apply (or BACKFILL_APPLY=1) to write. Idempotent;
 * safe to re-run.
 */
const APPLY =
  process.argv.includes("--apply") || process.env.BACKFILL_APPLY === "1";

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

async function main() {
  loadEnvLocal();
  const { default: mongoose } = await import("mongoose");
  const { default: connectDB } = await import("../src/lib/connectDB");
  await connectDB();

  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB connection is not ready");
  const users = database.collection("users");

  const snapshot = await users.find({}).toArray();
  const beforeCount = snapshot.length;

  // Preflight: never auto-merge two identities that collapse to one canonical
  // key, and never index a user with no email. Abort before any write.
  const byNormalized = new Map<string, string[]>();
  const invalid: string[] = [];
  for (const user of snapshot) {
    const normalized = normalizeEmail(user.email);
    if (!normalized) {
      invalid.push(String(user._id));
      continue;
    }
    byNormalized.set(normalized, [
      ...(byNormalized.get(normalized) ?? []),
      String(user._id),
    ]);
  }
  const duplicates = [...byNormalized.entries()].filter(
    ([, ids]) => ids.length > 1,
  );
  if (invalid.length || duplicates.length) {
    console.error("Aborted before writes: email identity conflicts.");
    for (const id of invalid) console.error(`  missing email: user=${id}`);
    for (const [email, ids] of duplicates) {
      console.error(`  duplicate ${email}: ${ids.join(", ")}`);
    }
    throw new Error("Resolve email conflicts, then run again");
  }

  const summary = { users: beforeCount, backfilled: 0, adminReconciled: 0 };
  for (const user of snapshot) {
    const adminForce = user.role === "admin" && user.twoFactorEnabled !== false;
    const needsWork =
      user.emailNormalized !== normalizeEmail(user.email) ||
      !Number.isInteger(user.sessionVersion) ||
      typeof user.twoFactorEnabled !== "boolean" ||
      adminForce;
    if (needsWork) summary.backfilled++;
    if (adminForce) summary.adminReconciled++;
  }

  console.log(`${APPLY ? "[APPLY]" : "[DRY-RUN]"} 2FA auth-field backfill`);
  console.log(JSON.stringify(summary, null, 2));
  if (!APPLY) {
    console.log(
      "No writes performed. Back up MongoDB, then run: npx tsx scripts/backfill-2fa.ts --apply",
    );
    await mongoose.disconnect();
    return;
  }

  for (const user of snapshot) {
    const set: Record<string, unknown> = {};
    const normalized = normalizeEmail(user.email);
    if (user.emailNormalized !== normalized) set.emailNormalized = normalized;
    if (!Number.isInteger(user.sessionVersion)) set.sessionVersion = 0;
    if (typeof user.twoFactorEnabled !== "boolean") {
      set.twoFactorEnabled = false;
    }
    // Admin is excluded from 2FA — always false, even if a stray value exists.
    if (user.role === "admin") set.twoFactorEnabled = false;
    if (Object.keys(set).length > 0) {
      await users.updateOne({ _id: user._id }, { $set: set });
    }
  }

  await users.createIndex(
    { emailNormalized: 1 },
    { unique: true, sparse: true, name: "emailNormalized_1" },
  );

  const afterCount = await users.countDocuments({});
  if (afterCount !== beforeCount) {
    throw new Error(`User count changed: ${beforeCount} → ${afterCount}`);
  }
  console.log("Backfill completed. Re-running --apply is safe.");
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
