import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

export function pepper(): string {
  if (process.env.AUTH_TOKEN_PEPPER) return process.env.AUTH_TOKEN_PEPPER;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_TOKEN_PEPPER is required in production");
  }
  return process.env.AUTH_SECRET || "ecoshop-development-only-pepper";
}

/** A cryptographically random 6-digit code (leading zeros preserved). */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC-SHA256 digest of a code — this is what we persist, never the raw code. */
export function hashOtp(code: string): string {
  return createHmac("sha256", pepper()).update(code).digest("hex");
}

/** Constant-time comparison of a candidate code against a stored digest. */
export function verifyOtp(code: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashOtp(code), "hex");
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  if (candidate.length !== stored.length || candidate.length === 0) return false;
  return timingSafeEqual(candidate, stored);
}

/** A high-entropy opaque token for password-reset links (hex string). */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** HMAC digest of a reset token — only the digest is ever stored. */
export function hashToken(token: string): string {
  return createHmac("sha256", pepper()).update(token).digest("hex");
}
