import { loadEnvLocal } from "./loadEnv";

/** Creates the only admin account from environment variables. */
async function main() {
  loadEnvLocal();

  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrator";
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  const { default: bcrypt } = await import("bcryptjs");
  const { default: mongoose } = await import("mongoose");
  const { default: connectDB } = await import("../src/lib/connectDB");
  const { default: User } = await import("../src/model/user.model");
  const { validatePasswordPolicy, BCRYPT_COST } = await import(
    "../src/lib/security/password"
  );
  const { emailIdentityFilter, normalizeEmail } = await import(
    "../src/lib/security/email"
  );

  const emailNormalized = normalizeEmail(email);
  const policy = await validatePasswordPolicy(password);
  if (!policy.ok) throw new Error(`Invalid ADMIN_PASSWORD: ${policy.reason}`);

  await connectDB();
  if (await User.findOne({ role: "admin" }).select("_id")) {
    throw new Error("An admin account already exists");
  }
  if (await User.findOne(emailIdentityFilter(emailNormalized)).select("_id")) {
    throw new Error("ADMIN_EMAIL is already in use");
  }

  const admin = await User.create({
    name,
    email,
    emailNormalized,
    emailVerifiedAt: new Date(),
    password: await bcrypt.hash(password, BCRYPT_COST),
    role: "admin",
    sessionVersion: 0,
    twoFactorEnabled: false,
  });

  console.log(`Admin created: ${admin.email}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    const { default: mongoose } = await import("mongoose");
    await mongoose.disconnect();
  } catch {
    // Connection was never opened.
  }
  process.exitCode = 1;
});
