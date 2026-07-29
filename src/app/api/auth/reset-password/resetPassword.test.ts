import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { hashToken } from "@/lib/security/otp";
import PasswordResetToken from "@/model/passwordResetToken.model";
import User from "@/model/user.model";

// Mail đi qua outbox: chặn ở tầng này để test không ghi job thật rồi cố gửi.
vi.mock("@/lib/mail/outbox", () => ({
  enqueueMail: vi.fn().mockResolvedValue("000000000000000000000001"),
  flushOne: vi
    .fn()
    .mockResolvedValue({ outcome: "accepted", stopBatch: false }),
  cancelSupersededMails: vi.fn().mockResolvedValue(0),
}));

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let resetPOST: typeof import("@/app/api/auth/reset-password/route").POST;

const STRONG = "verystrongpassword1";
const tokenFor = (label: string) =>
  createHash("sha256").update(label).digest("hex");
const req = (body: unknown) =>
  new NextRequest("http://localhost/", {
    method: "POST",
    body: JSON.stringify(body),
  });

async function seedUserAndToken(
  tokenLabel: string,
  opts: { expiresAt: Date; usedAt?: Date },
) {
  await User.create({
    name: "U",
    email: "u@x.com",
    password: await bcrypt.hash("oldpassword123", 10),
    role: "user",
  });
  await PasswordResetToken.create({
    email: "u@x.com",
    emailNormalized: "u@x.com",
    tokenHash: hashToken(tokenFor(tokenLabel)),
    expiresAt: opts.expiresAt,
    usedAt: opts.usedAt,
  });
}

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  resetPOST = (await import("@/app/api/auth/reset-password/route")).POST;
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "" })),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await User.deleteMany({});
  await PasswordResetToken.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("reset password", () => {
  it("resets the password with a valid token and marks it used", async () => {
    await seedUserAndToken("good-token", {
      expiresAt: new Date(Date.now() + 600_000),
    });

    const res = await resetPOST(
      req({ token: tokenFor("good-token"), newPassword: STRONG }),
    );
    expect(res.status).toBe(200);

    const user = await User.findOne({ email: "u@x.com" }).select("+password");
    expect(await bcrypt.compare(STRONG, user!.password!)).toBe(true);
    const token = await PasswordResetToken.findOne({
      emailNormalized: "u@x.com",
    });
    expect(token?.usedAt).toBeTruthy();
  });

  it("rejects an expired token", async () => {
    await seedUserAndToken("expired", {
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await resetPOST(
      req({ token: tokenFor("expired"), newPassword: STRONG }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an already-used token", async () => {
    await seedUserAndToken("used", {
      expiresAt: new Date(Date.now() + 600_000),
      usedAt: new Date(),
    });
    const res = await resetPOST(
      req({ token: tokenFor("used"), newPassword: STRONG }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a weak new password", async () => {
    await seedUserAndToken("good2", {
      expiresAt: new Date(Date.now() + 600_000),
    });
    const res = await resetPOST(
      req({ token: tokenFor("good2"), newPassword: "short" }),
    );
    expect(res.status).toBe(400);
  });

  it("consumes a reset token only once under concurrency", async () => {
    await seedUserAndToken("single-use", {
      expiresAt: new Date(Date.now() + 600_000),
    });

    const responses = await Promise.all([
      resetPOST(req({ token: tokenFor("single-use"), newPassword: STRONG })),
      resetPOST(req({ token: tokenFor("single-use"), newPassword: STRONG })),
    ]);

    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
  });
});
