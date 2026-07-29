import bcrypt from "bcryptjs";

import connectDB from "@/lib/connectDB";
import type { LoginRole } from "@/lib/roleRoutes";
import { emailIdentityFilter, normalizeEmail } from "@/lib/security/email";
import { recordLoginActivity } from "@/lib/security/loginActivity";
import { BCRYPT_COST } from "@/lib/security/password";
import {
  checkLoginThrottle,
  clientIp,
  rateLimit,
  recordLoginFailure,
  resetLoginFailures,
} from "@/lib/security/rateLimit";
import User from "@/model/user.model";

/** Minimal, session-safe user shape handed back to NextAuth on success. */
export type PortalUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

// A real bcrypt hash computed once at module load. Comparing against it for an
// unknown / passwordless account makes a failed attempt spend the same time as
// a real one, so response timing can't be used to enumerate accounts.
const FAKE_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", BCRYPT_COST);

/**
 * Server-side credential + role gate for the Admin login portal (User/Vendor go
 * through the OTP grant flow instead). Adds brute-force defence: a per-account
 * progressive lockout and a per-IP request cap, plus constant-time bcrypt for
 * unknown accounts. Every expected failure returns `null` so NextAuth surfaces a
 * single generic credentials error and never reveals which check failed.
 *
 * Admin deliberately gets NO device cookie / LoginChallenge / trusted device —
 * it never participates in 2FA.
 */
export async function authorizePortalCredentials(
  credentials: Partial<Record<"email" | "password", unknown>> | undefined,
  expectedRole: LoginRole,
  request?: Request,
): Promise<PortalUser | null> {
  const email = credentials?.email;
  const password = credentials?.password;

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length === 0 ||
    password.length === 0
  ) {
    return null;
  }

  await connectDB();

  const account = normalizeEmail(email);
  const accountKey = `login-failure:acct:${account}`;
  const ip = request ? clientIp(request.headers) : null;

  // Throttle before touching credentials: per-IP cap + per-account progressive
  // lockout (1/5/15/30/60 min). A blocked attempt fails closed as generic.
  const [ipAllowed, throttle] = await Promise.all([
    ip
      ? rateLimit(`login:ip:${ip}`, { max: 20, windowMs: 15 * 60 * 1000 })
      : Promise.resolve(true),
    account
      ? checkLoginThrottle(accountKey)
      : Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
  ]);
  if (!ipAllowed || !throttle.allowed) {
    return null;
  }

  // password is select:false — load it explicitly; match on the normalized
  // email so casing/whitespace variants resolve to the same account.
  const user = await User.findOne(
    emailIdentityFilter(account),
  ).select("+password");

  // Always run bcrypt (fake hash when there is no real one) to equalize timing.
  const hash =
    user && typeof user.password === "string" ? user.password : FAKE_HASH;
  const isMatch = await bcrypt.compare(password, hash);

  // Role is checked together with the password/user so a wrong-role attempt is
  // indistinguishable from a wrong-password one.
  if (
    !user ||
    typeof user.password !== "string" ||
    !isMatch ||
    user.role !== expectedRole
  ) {
    if (account) await recordLoginFailure(accountKey);
    return null;
  }

  if (account) await resetLoginFailures(accountKey);

  // Success audit. Admin has no device, so the activity carries an empty device
  // hash. Best-effort: recordLoginActivity swallows its own errors.
  recordLoginActivity({
    userId: user._id.toString(),
    success: true,
    ip: ip ?? "unknown",
    userAgent: request?.headers.get("user-agent") ?? null,
    deviceIdHash: "",
  });

  return {
    id: user._id.toString(),
    email: user.email as string,
    name: user.name as string,
    role: user.role,
  };
}
