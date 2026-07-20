import connectDB from "@/lib/connectDB";
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
 * - New email → create a `user` account.
 * - Existing account missing a role → normalise it to `user`.
 * - Existing Vendor/Admin → return `false`; the caller rejects the sign-in so
 *   privileged accounts can only enter through their dedicated credential
 *   portal, never Google on the user portal.
 *
 * On success it mutates `user.id`/`user.role` to the persisted values (so the
 * JWT/session carries the real id and role) and returns `true`. On rejection it
 * leaves `user` untouched and creates/updates nothing.
 */
export async function prepareGoogleUser(
  user: GoogleSignInUser,
): Promise<boolean> {
  await connectDB();

  let existingUser = await User.findOne({ email: user.email });

  if (!existingUser) {
    existingUser = await User.create({
      name: user.name,
      email: user.email,
      image: user.image,
      role: "user",
    });
  } else if (!existingUser.role) {
    existingUser.role = "user";
    if (!existingUser.image && user.image) {
      existingUser.image = user.image;
    }
    await existingUser.save();
  } else if (existingUser.role !== "user") {
    return false;
  } else if (!existingUser.image && user.image) {
    existingUser.image = user.image;
    await existingUser.save();
  }

  user.id = existingUser._id.toString();
  user.role = existingUser.role.toString();
  return true;
}
