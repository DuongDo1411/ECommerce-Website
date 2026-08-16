const HEX_256_RE = /^[a-f0-9]{64}$/i;

/** Token kích hoạt tài khoản, bắt từ fragment của liên kết trong mail đăng ký. */
export const REGISTRATION_TOKEN_STORAGE_KEY = "ecoshop.registration-token";
/** Mốc gửi mail kích hoạt gần nhất, để nút "gửi lại" giữ được cooldown qua reload. */
export const REGISTRATION_LAST_SENT_AT_STORAGE_KEY =
  "ecoshop.registration-last-sent-at";
export const PASSWORD_RESET_TOKEN_STORAGE_KEY = "ecoshop.password-reset-token";

export function retainSecret(current: string, candidate: string | null): string {
  const normalized = candidate?.trim() ?? "";
  return HEX_256_RE.test(normalized) ? normalized : current;
}

/**
 * Captures a 256-bit secret from a URL fragment without erasing an already
 * captured value. React Strict Mode re-runs effects in development; the second
 * run sees the fragment after replaceState removed it and must retain the
 * value captured by the first run.
 */
export function retainFragmentSecret(
  current: string,
  hash: string,
  parameter: string,
): string {
  const candidate =
    new URLSearchParams(hash.replace(/^#/, "")).get(parameter)?.trim() ?? "";
  return retainSecret(current, candidate);
}

/** Fragment wins over in-memory state, which wins over tab-scoped recovery. */
export function resolveFragmentSecret(
  current: string,
  hash: string,
  parameter: string,
  stored: string | null,
): string {
  const fromStorage = retainSecret("", stored);
  const remembered = retainSecret(fromStorage, current);
  return retainFragmentSecret(remembered, hash, parameter);
}
