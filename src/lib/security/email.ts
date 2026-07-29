/**
 * Canonical identity key used for every account lookup and unique index.
 * Keep the original address separately for display and mail delivery.
 */
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Compatibility filter while legacy rows are being backfilled. */
export function emailIdentityFilter(emailNormalized: string) {
  const escaped = emailNormalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: [
      { emailNormalized },
      { email: { $regex: `^${escaped}$`, $options: "i" } },
    ],
  };
}
