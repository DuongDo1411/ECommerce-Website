export interface OriginEnvironment {
  AUTH_URL?: string;
  ALLOWED_ORIGINS?: string;
  NODE_ENV?: string;
}

function normalizeHttpOrigin(
  value: string,
  production = false,
): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (production && url.protocol !== "https:" && !loopback) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function addOrigin(
  target: Set<string>,
  value: string | undefined,
  production: boolean,
) {
  if (!value) return;
  const normalized = normalizeHttpOrigin(value, production);
  if (normalized) target.add(normalized);
}

/** Exact browser origins allowed to use cookie-authenticated endpoints. */
export function configuredOrigins(
  env: OriginEnvironment = process.env,
  developmentPort = 3000,
): string[] {
  const origins = new Set<string>();
  const production = env.NODE_ENV === "production";
  addOrigin(origins, env.AUTH_URL, production);

  for (const candidate of (env.ALLOWED_ORIGINS ?? "").split(",")) {
    addOrigin(origins, candidate, production);
  }

  if (env.NODE_ENV !== "production" && origins.size === 0) {
    origins.add(`http://localhost:${developmentPort}`);
    origins.add(`http://127.0.0.1:${developmentPort}`);
  }

  return [...origins];
}

export function canonicalOrigin(
  env: OriginEnvironment = process.env,
): string | null {
  return env.AUTH_URL
    ? normalizeHttpOrigin(env.AUTH_URL, env.NODE_ENV === "production")
    : null;
}

export function websocketOrigin(origin: string): string {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.origin;
}
