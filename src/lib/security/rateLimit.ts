import { createHmac } from "crypto";

import connectDB from "@/lib/connectDB";
import { pepper } from "@/lib/security/otp";
import RateLimitBucket from "@/model/rateLimitBucket.model";

function hashKey(key: string): string {
  return createHmac("sha256", pepper()).update(key).digest("hex");
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Atomically consumes one fixed-window allowance. The update pipeline resets
 * an expired bucket or increments a live one in one database operation, so
 * parallel requests cannot overwrite each other's increments.
 */
export async function consumeRateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): Promise<RateLimitResult> {
  await connectDB();
  const now = new Date();
  const nextExpiry = new Date(now.getTime() + opts.windowMs);
  const keyHash = hashKey(key);
  const expired = {
    $lte: [{ $ifNull: ["$expiresAt", new Date(0)] }, now],
  };

  const pipeline = [
    {
      $set: {
        keyHash,
        count: {
          $cond: [
            expired,
            1,
            { $add: [{ $ifNull: ["$count", 0] }, 1] },
          ],
        },
        windowStart: {
          $cond: [expired, now, { $ifNull: ["$windowStart", now] }],
        },
        expiresAt: {
          $cond: [
            expired,
            nextExpiry,
            { $ifNull: ["$expiresAt", nextExpiry] },
          ],
        },
      },
    },
  ];
  let bucket;
  try {
    bucket = await RateLimitBucket.findOneAndUpdate(
      { keyHash },
      pipeline,
      { upsert: true, returnDocument: "after", updatePipeline: true },
    );
  } catch (error) {
    // Two first requests may both attempt the upsert. The unique key decides
    // the winner; the loser retries as a normal atomic increment.
    if (!isDuplicateKey(error)) throw error;
    bucket = await RateLimitBucket.findOneAndUpdate({ keyHash }, pipeline, {
      returnDocument: "after",
      updatePipeline: true,
    });
  }

  const count = bucket?.count ?? opts.max + 1;
  const expiresAt = bucket?.expiresAt ?? nextExpiry;
  return {
    allowed: count <= opts.max,
    remaining: Math.max(0, opts.max - count),
    retryAfterSeconds: Math.max(
      0,
      Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

/** Backwards-compatible boolean wrapper used by the other security routes. */
export async function rateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): Promise<boolean> {
  return (await consumeRateLimit(key, opts)).allowed;
}

const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_RESET_MS = 24 * 60 * 60 * 1000;
const LOGIN_BLOCK_DURATIONS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
] as const;

export async function checkLoginThrottle(key: string): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
}> {
  await connectDB();
  const now = Date.now();
  const bucket = await RateLimitBucket.findOne({ keyHash: hashKey(key) })
    .select("blockedUntil lastFailureAt")
    .lean();
  const blockedUntil = bucket?.blockedUntil?.getTime() ?? 0;
  const lastFailure = bucket?.lastFailureAt?.getTime() ?? 0;
  const active =
    lastFailure > now - LOGIN_FAILURE_RESET_MS && blockedUntil > now;
  return {
    allowed: !active,
    retryAfterSeconds: active
      ? Math.max(1, Math.ceil((blockedUntil - now) / 1000))
      : 0,
  };
}

/**
 * Records a failed password attempt atomically. Every five failures in the
 * window starts a progressively longer block. A quiet 24-hour period resets
 * the escalation level.
 */
export async function recordLoginFailure(key: string): Promise<{
  blocked: boolean;
  retryAfterSeconds: number;
}> {
  await connectDB();
  const now = new Date();
  const keyHash = hashKey(key);
  const windowCutoff = new Date(now.getTime() - LOGIN_FAILURE_WINDOW_MS);
  const resetCutoff = new Date(now.getTime() - LOGIN_FAILURE_RESET_MS);
  const expiresAt = new Date(now.getTime() + LOGIN_FAILURE_RESET_MS);

  const staleWindow = {
    $lte: [
      { $ifNull: ["$failureWindowStart", new Date(0)] },
      windowCutoff,
    ],
  };
  const staleLevel = {
    $lte: [{ $ifNull: ["$lastFailureAt", new Date(0)] }, resetCutoff],
  };
  const baseCount = {
    $cond: [staleWindow, 0, { $ifNull: ["$failureCount", 0] }],
  };
  const nextCount = { $add: [baseCount, 1] };
  const shouldBlock = { $gte: [nextCount, 5] };
  const baseLevel = {
    $cond: [staleLevel, 0, { $ifNull: ["$failureLevel", 0] }],
  };
  const nextLevel = {
    $min: [LOGIN_BLOCK_DURATIONS_MS.length, { $add: [baseLevel, 1] }],
  };
  const blockDuration = {
    $arrayElemAt: [
      [...LOGIN_BLOCK_DURATIONS_MS],
      { $subtract: [nextLevel, 1] },
    ],
  };

  const pipeline = [
    {
      $set: {
        keyHash,
        count: { $ifNull: ["$count", 0] },
        windowStart: { $ifNull: ["$windowStart", now] },
        failureCount: { $cond: [shouldBlock, 0, nextCount] },
        failureWindowStart: {
          $cond: [
            { $or: [staleWindow, shouldBlock] },
            now,
            "$failureWindowStart",
          ],
        },
        failureLevel: { $cond: [shouldBlock, nextLevel, baseLevel] },
        blockedUntil: {
          $cond: [
            shouldBlock,
            { $add: [now, blockDuration] },
            { $ifNull: ["$blockedUntil", new Date(0)] },
          ],
        },
        lastFailureAt: now,
        expiresAt,
      },
    },
  ];
  let bucket;
  try {
    bucket = await RateLimitBucket.findOneAndUpdate(
      { keyHash },
      pipeline,
      { upsert: true, returnDocument: "after", updatePipeline: true },
    );
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    bucket = await RateLimitBucket.findOneAndUpdate({ keyHash }, pipeline, {
      returnDocument: "after",
      updatePipeline: true,
    });
  }

  const blockedUntil = bucket?.blockedUntil?.getTime() ?? 0;
  return {
    blocked: blockedUntil > now.getTime(),
    retryAfterSeconds:
      blockedUntil > now.getTime()
        ? Math.ceil((blockedUntil - now.getTime()) / 1000)
        : 0,
  };
}

export async function resetLoginFailures(key: string): Promise<void> {
  await connectDB();
  await RateLimitBucket.deleteOne({ keyHash: hashKey(key) });
}

/** Only trusts proxy-supplied IP addresses when deployment opts in. */
export function clientIp(headers: Headers): string | null {
  if (process.env.TRUST_PROXY !== "true") return null;
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ||
    headers.get("x-real-ip")?.trim().slice(0, 64) ||
    null
  );
}
