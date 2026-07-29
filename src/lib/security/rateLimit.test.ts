import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import RateLimitBucket from "@/model/rateLimitBucket.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let consumeRateLimit: typeof import("./rateLimit").consumeRateLimit;
let checkLoginThrottle: typeof import("./rateLimit").checkLoginThrottle;
let recordLoginFailure: typeof import("./rateLimit").recordLoginFailure;
let clientIp: typeof import("./rateLimit").clientIp;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  ({ consumeRateLimit, checkLoginThrottle, recordLoginFailure, clientIp } =
    await import("./rateLimit"));
  await RateLimitBucket.init();
});

afterEach(async () => {
  await RateLimitBucket.deleteMany({});
  delete process.env.TRUST_PROXY;
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("atomic rate limiting", () => {
  it("does not lose increments under concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        consumeRateLimit("parallel-key", { max: 10, windowMs: 60_000 }),
      ),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect((await RateLimitBucket.findOne())?.count).toBe(50);
  });

  it("starts a progressive account block after each five failures", async () => {
    let result = { blocked: false, retryAfterSeconds: 0 };
    for (let index = 0; index < 5; index += 1) {
      result = await recordLoginFailure("account-key");
    }
    expect(result.blocked).toBe(true);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect((await checkLoginThrottle("account-key")).allowed).toBe(false);
  });

  it("ignores forwarded IP headers unless TRUST_PROXY is explicitly true", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    });
    expect(clientIp(headers)).toBeNull();
    process.env.TRUST_PROXY = "true";
    expect(clientIp(headers)).toBe("203.0.113.10");
  });
});
