import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import User from "@/model/user.model";

const authState: { value: null | { user: { id: string } } } = { value: null };
vi.mock("@/auth", () => ({ auth: vi.fn(async () => authState.value) }));

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let mongo: MongoMemoryServer;
let post: typeof import("@/app/api/user/phone/route").POST;

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/user/phone", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URL = mongo.getUri();
  await mongoose.connect(process.env.MONGODB_URL);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  post = (await import("@/app/api/user/phone/route")).POST;
});

afterEach(async () => {
  authState.value = null;
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe("phone-only profile endpoint", () => {
  it("ignores injected role fields and never returns a User document", async () => {
    const user = await User.create({
      name: "Buyer",
      email: "buyer@example.com",
      emailNormalized: "buyer@example.com",
      emailVerifiedAt: new Date(),
      role: "user",
    });
    authState.value = { user: { id: String(user._id) } };

    const response = await post(
      request({ phone: "0901234567", role: "admin", isApproved: true }),
    );
    const payload = await response.json();
    const fresh = await User.findById(user._id);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      message: "Đã cập nhật số điện thoại.",
      phone: "0901234567",
    });
    expect(fresh?.role).toBe("user");
    expect(fresh?.isApproved).toBe(false);
  });

  it("rejects unauthenticated updates", async () => {
    const response = await post(request({ phone: "0901234567" }));
    expect(response.status).toBe(401);
  });
});
