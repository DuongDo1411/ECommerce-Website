import bcrypt from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import LoginChallenge from "@/model/loginChallenge.model";
import RateLimitBucket from "@/model/rateLimitBucket.model";
import TrustedDevice from "@/model/trustedDevice.model";
import User from "@/model/user.model";

const authState: { value: null | { user: { id: string } } } = { value: null };
vi.mock("@/auth", () => ({ auth: vi.fn(async () => authState.value) }));
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn() }));

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let post: typeof import("@/app/api/user/change-password/route").POST;

const OLD_PASSWORD = "original-password-1";
const FIRST_PASSWORD = "replacement-password-1";
const SECOND_PASSWORD = "replacement-password-2";
const request = (newPassword: string) =>
  new NextRequest("http://localhost/api/user/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: OLD_PASSWORD, newPassword }),
  });

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URL = replset.getUri();
  await mongoose.connect(process.env.MONGODB_URL);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  post = (await import("@/app/api/user/change-password/route")).POST;
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "" })),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  authState.value = null;
  await Promise.all([
    User.deleteMany({}),
    LoginChallenge.deleteMany({}),
    TrustedDevice.deleteMany({}),
    RateLimitBucket.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("change password", () => {
  it("allows only one concurrent request to replace the same old hash", async () => {
    const user = await User.create({
      name: "Buyer",
      email: "buyer@example.com",
      emailNormalized: "buyer@example.com",
      emailVerifiedAt: new Date(),
      password: await bcrypt.hash(OLD_PASSWORD, 10),
      role: "user",
      sessionVersion: 0,
    });
    authState.value = { user: { id: String(user._id) } };

    const responses = await Promise.all([
      post(request(FIRST_PASSWORD)),
      post(request(SECOND_PASSWORD)),
    ]);
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);

    const fresh = await User.findById(user._id).select("+password");
    expect(fresh?.sessionVersion).toBe(1);
    const firstWon = await bcrypt.compare(
      FIRST_PASSWORD,
      fresh?.password ?? "",
    );
    const secondWon = await bcrypt.compare(
      SECOND_PASSWORD,
      fresh?.password ?? "",
    );
    expect(Number(firstWon) + Number(secondWon)).toBe(1);
  });
});
