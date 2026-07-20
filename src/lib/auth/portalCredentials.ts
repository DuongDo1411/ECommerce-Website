import bcrypt from "bcryptjs";

import connectDB from "@/lib/connectDB";
import type { LoginRole } from "@/lib/roleRoutes";
import User from "@/model/user.model";

/** Minimal, session-safe user shape handed back to NextAuth on success. */
export type PortalUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/**
 * Server-side credential + role gate for the per-role login portals.
 *
 * Returns a minimal safe user ONLY when the password matches AND the account's
 * role equals `expectedRole` (which the server fixes per provider — it is never
 * taken from the client). Every *expected* failure — malformed input, unknown
 * user, Google-only account with no password, wrong password, or wrong role —
 * returns `null` so NextAuth surfaces a single generic credentials error and
 * never reveals which check failed or whether the account exists.
 *
 * Unexpected errors (e.g. the database being unreachable) are allowed to
 * propagate so they are not silently misreported as bad credentials.
 */
export async function authorizePortalCredentials(
  credentials: Partial<Record<"email" | "password", unknown>> | undefined,
  expectedRole: LoginRole,
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

  const user = await User.findOne({ email });
  if (!user || typeof user.password !== "string") {
    return null;
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return null;
  }

  // Role is checked only after the password so a wrong-role attempt is
  // indistinguishable (timing included) from a wrong-password attempt.
  if (user.role !== expectedRole) {
    return null;
  }

  return {
    id: user._id.toString(),
    email: user.email as string,
    name: user.name as string,
    role: user.role,
  };
}
