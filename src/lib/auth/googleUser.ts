import connectDB from "@/lib/connectDB";
import { emailIdentityFilter, normalizeEmail } from "@/lib/security/email";
import User from "@/model/user.model";

/** The mutable subset of NextAuth's `user` the Google policy reads and updates. */
export type GoogleSignInUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string;
};

/**
 * Applies the "Google is a user-only doorway" policy and returns whether the
 * sign-in may continue.
 *
 * - New email → create a `user` account, already email-verified (Google proved
 *   ownership) with a zeroed session version.
 * - Existing account missing a role → normalise it to `user` and backfill the
 *   auth fields.
 * - Existing Vendor/Admin → return `false`; privileged accounts can only enter
 *   through their dedicated credential portal, never Google on the user portal.
 *
 * On success it mutates `user.id`/`user.role` to the persisted values (so the
 * JWT/session carries the real id and role) and returns `true`.
 */
export async function prepareGoogleUser(
  user: GoogleSignInUser,
): Promise<boolean> {
  await connectDB();

  const emailNormalized = normalizeEmail(user.email);
  if (!emailNormalized) return false;

  let existingUser = await User.findOne(emailIdentityFilter(emailNormalized));

  if (!existingUser) {
    existingUser = await User.create({
      name: user.name,
      email: user.email,
      emailNormalized,
      emailVerifiedAt: new Date(),
      sessionVersion: 0,
      image: user.image,
      role: "user",
    });
  } else if (existingUser.role && existingUser.role !== "user") {
    // Vendor/Admin email may never enter through the Google user doorway.
    return false;
  } else {
    // Role is `user` (or an unset legacy role) — normalise + backfill the auth
    // fields. Google sign-in is itself proof the email is owned.
    let dirty = false;
    if (!existingUser.role) {
      existingUser.role = "user";
      dirty = true;
    }
    if (!existingUser.emailNormalized) {
      existingUser.emailNormalized = emailNormalized;
      dirty = true;
    }
    if (!existingUser.emailVerifiedAt) {
      existingUser.emailVerifiedAt = new Date();
      dirty = true;
    }
    if (!Number.isInteger(existingUser.sessionVersion)) {
      existingUser.sessionVersion = 0;
      dirty = true;
    }
    if (!existingUser.image && user.image) {
      existingUser.image = user.image;
      dirty = true;
    }
    if (dirty) await existingUser.save();
  }

  user.id = existingUser._id.toString();
  user.role = existingUser.role.toString();
  return true;
}
