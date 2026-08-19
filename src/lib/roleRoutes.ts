// Pure, client-safe role routing helpers.
// IMPORTANT: keep this file free of server-only imports (mongoose, next/navigation,
// @/auth ...) so it can be imported from client components AND proxy.ts alike.

export function homeForRole(role?: unknown): string {
  if (role === "admin") return "/admin";
  if (role === "vendor") return "/vendor";
  return "/";
}

/**
 * Returns a safe same-origin relative path, or null when the input is unsafe.
 * Blocks absolute URLs and protocol-relative URLs ("//evil.com") to prevent
 * open-redirect via the `callbackUrl` query param.
 */
export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  // Must be a relative path rooted at "/", but not "//" (protocol-relative).
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // Reject backslash tricks that some browsers normalise to "//".
  if (raw.includes("\\")) return null;
  return raw;
}

/** The three login portals, each backed by its own NextAuth credentials provider. */
export type LoginRole = "user" | "vendor" | "admin";

const CREDENTIAL_PROVIDER_BY_ROLE: Record<LoginRole, string> = {
  user: "user-credentials",
  vendor: "vendor-credentials",
  admin: "admin-credentials",
};

/**
 * Maps a portal role to its dedicated NextAuth Credentials provider id. Shared
 * by the client (which calls `signIn(...)`) and the server (which registers the
 * providers under these ids) so the mapping can never drift between the two.
 */
export function credentialProviderForRole(role: LoginRole): string {
  return CREDENTIAL_PROVIDER_BY_ROLE[role];
}

/**
 * The login portal that matches a role.
 *
 * Counterpart to `homeForRole`: that one answers "where does this account land AFTER signing
 * in", this one answers "where must it sign in". Sending a vendor to `/login` is a dead end —
 * the buyer portal rejects any account whose role is not `user`.
 */
export function loginForRole(role?: unknown): string {
  if (role === "admin") return "/admin/login";
  if (role === "vendor") return "/vendor/login";
  return "/login";
}
