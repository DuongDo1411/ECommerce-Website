import connectDB from "@/lib/connectDB";
import LoginActivity from "@/model/loginActivity.model";

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** User agents can be arbitrarily long; keep enough to recognise a browser. */
const MAX_USER_AGENT = 200;

/**
 * Appends one sign-in attempt to the account's audit trail.
 *
 * Deliberately swallows its own errors: an unwritable log must never be the
 * reason a legitimate sign-in fails.
 */
export async function recordLoginActivity(entry: {
  userId: string;
  success: boolean;
  ip: string;
  userAgent: string | null;
  deviceIdHash: string;
}): Promise<void> {
  try {
    await connectDB();
    await LoginActivity.create({
      userId: entry.userId,
      success: entry.success,
      ip: entry.ip,
      userAgent: (entry.userAgent ?? "").slice(0, MAX_USER_AGENT),
      deviceIdHash: entry.deviceIdHash,
      expiresAt: new Date(Date.now() + RETENTION_MS),
    });
  } catch {
    // Intentionally ignored — see the doc comment above.
  }
}
