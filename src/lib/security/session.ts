import mongoose, { type ClientSession } from "mongoose";

import connectDB from "@/lib/connectDB";
import { getIO } from "@/lib/socket-server";
import LoginChallenge from "@/model/loginChallenge.model";
import TrustedDevice from "@/model/trustedDevice.model";
import User from "@/model/user.model";

export type RevokeAccountSecurityOptions = {
  /** Join an existing password/security transaction when supplied. */
  session?: ClientSession;
  set?: { twoFactorEnabled?: boolean; emailVerifiedAt?: Date };
};

/**
 * Database half of account-wide revocation. Callers that also mutate a
 * password pass their transaction session so the password, version bump and
 * credential cleanup commit together. Socket disconnect happens after commit.
 */
export async function revokeAccountSecurity(
  userId: string,
  options: RevokeAccountSecurityOptions = {},
): Promise<boolean> {
  await connectDB();
  const queryOptions = options.session ? { session: options.session } : {};
  const update: {
    $inc: { sessionVersion: number };
    $set?: { twoFactorEnabled?: boolean; emailVerifiedAt?: Date };
  } = { $inc: { sessionVersion: 1 } };
  if (options.set && Object.keys(options.set).length > 0) {
    update.$set = options.set;
  }

  const result = await User.updateOne({ _id: userId }, update, queryOptions);
  if (result.matchedCount !== 1) return false;

  // MongoDB transactions do not support parallel operations on one session.
  await TrustedDevice.deleteMany({ userId }, queryOptions);
  await LoginChallenge.deleteMany({ userId }, queryOptions);
  return true;
}

export function disconnectUserSockets(userId: string): void {
  getIO()?.in(`user:${userId}`).disconnectSockets(true);
}

/** Standalone wrapper used by logout-all and legacy password callers. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await connectDB();
  const session = await mongoose.startSession();
  try {
    let found = false;
    await session.withTransaction(async () => {
      found = await revokeAccountSecurity(userId, { session });
      if (!found) throw new Error("Account not found");
    });
  } finally {
    await session.endSession();
  }
  disconnectUserSockets(userId);
}
