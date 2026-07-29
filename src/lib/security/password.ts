import { createHash } from "crypto";

/** bcrypt work factor for all new hashes (raised from the legacy 10). */
export const BCRYPT_COST = 12;

// Cheap offline catch for the most obvious weak passwords that still clear the
// length rule. HIBP below is the real breach defence.
const COMMON_PASSWORDS = new Set([
  "123456789012",
  "1234567890123",
  "12345678901234",
  "123456789012345",
  "1234567890123456",
  "qwertyuiop12",
  "qwertyqwerty",
  "qwerty123456",
  "asdfghjkl123",
  "letmeinletmein",
  "welcome12345",
  "iloveyou1234",
  "abc123abc123",
  "changeme1234",
  "administrator",
  "passwordpassword",
  "password1234",
  "password12345",
  "password123456",
  "passw0rd1234",
  "111111111111",
  "222222222222",
  "999999999999",
  "000000000000",
  "adminadmin12",
  "admin123456",
  "useruser1234",
  "secretsecret",
  "sunshinesunshine",
  "princessprincess",
  "footballfootball",
  "monkeymonkey",
  "dragondragon",
]);

export type PolicyResult = { ok: true } | { ok: false; reason: string };

/**
 * Validates a candidate password against the GĐ3 policy: 12–64 Unicode code
 * points, at most 72 UTF-8 bytes (bcrypt's limit), not an obvious common
 * password, and not present in a known breach (HaveIBeenPwned). Complexity
 * classes (upper/lower/digit/symbol) are deliberately NOT required — length +
 * breach checking is stronger and less annoying.
 */
export async function validatePasswordPolicy(
  password: string,
): Promise<PolicyResult> {
  if (typeof password !== "string") {
    return { ok: false, reason: "Mật khẩu không hợp lệ." };
  }

  // Reject oversized input before spreading it into a code-point array. This
  // keeps a malicious multi-megabyte value from causing a large allocation.
  // A valid 64-code-point password can use at most 128 UTF-16 code units.
  if (password.length > 128) {
    return { ok: false, reason: "Mật khẩu không được vượt quá 64 ký tự." };
  }
  // bcrypt only hashes the first 72 bytes, so anything longer would silently
  // truncate — reject it before doing any breach lookup or expensive work.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return { ok: false, reason: "Mật khẩu quá dài (giới hạn 72 byte)." };
  }

  const codePoints = [...password].length;
  if (codePoints < 12) {
    return { ok: false, reason: "Mật khẩu phải có ít nhất 12 ký tự." };
  }
  if (codePoints > 64) {
    return { ok: false, reason: "Mật khẩu không được vượt quá 64 ký tự." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      ok: false,
      reason: "Mật khẩu quá phổ biến, hãy chọn mật khẩu khác.",
    };
  }
  if (await isPwnedPassword(password)) {
    return {
      ok: false,
      reason:
        "Mật khẩu này đã xuất hiện trong các vụ rò rỉ dữ liệu. Hãy chọn mật khẩu khác.",
    };
  }

  return { ok: true };
}

/**
 * HaveIBeenPwned k-anonymity range check: only the first 5 chars of the SHA-1
 * are sent. Fails OPEN (returns false) on any network error/timeout so an HIBP
 * outage never blocks a legitimate signup — the local checks above still apply.
 */
async function isPwnedPassword(password: string): Promise<boolean> {
  try {
    const sha1 = createHash("sha1")
      .update(password)
      .digest("hex")
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    let res: Response;
    try {
      res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return false;

    const body = await res.text();
    return body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim().toUpperCase() === suffix);
  } catch {
    return false;
  }
}
