import { configuredOrigins } from "@/lib/security/origins";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Production mutations require an Origin from deployment-owned configuration.
 * Legitimate origin-less integrations are exempted by exact route in proxy.ts
 * and authenticate with their own webhook/cron signature or secret.
 */
export function isCrossSiteRequest(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;

  const origin = req.headers.get("origin");
  if (!origin) return process.env.NODE_ENV === "production";

  const allowed = new Set(configuredOrigins());
  // Local tools and tests can bind an arbitrary port. Never apply this request-
  // derived exception in production and never trust forwarded host headers.
  if (process.env.NODE_ENV !== "production") {
    allowed.add(req.nextUrl.origin);
  }

  try {
    return !allowed.has(new URL(origin).origin);
  } catch {
    return true;
  }
}
