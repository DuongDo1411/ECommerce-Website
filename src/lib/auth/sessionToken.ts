import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import type { JWT } from "next-auth/jwt";

/**
 * Refreshes a JWT from the database and enforces session revocation.
 *
 * Every request re-reads the account so a role or name change takes effect
 * without re-login. On top of that it compares the token's `sessionVersion`
 * stamp with the stored one: a password reset, password change or "log out
 * everywhere" bumps the stored counter, which leaves older tokens behind and
 * makes this return `null` — Auth.js reads that as "no session".
 *
 * @param isSignIn true on the sign-in call, where the token is being minted and
 * therefore adopts the current version instead of being checked against it.
 */
export async function applySessionState(
  token: JWT,
  isSignIn: boolean,
): Promise<JWT | null> {
  if (typeof token.id !== "string" || token.id.length === 0) return null;

  await connectDB();
  const freshUser = await User.findById(token.id).select(
    "email name role sessionVersion",
  ).lean();
  if (!freshUser) return null;

  const currentVersion = freshUser.sessionVersion;
  if (!Number.isInteger(currentVersion) || (currentVersion as number) < 0) {
    return null;
  }
  if (isSignIn) {
    token.sessionVersion = currentVersion;
  } else if (
    !Number.isInteger(token.sessionVersion) ||
    token.sessionVersion !== currentVersion
  ) {
    return null;
  }

  token.email = freshUser.email;
  token.name = freshUser.name;
  token.role = freshUser.role;
  return token;
}
