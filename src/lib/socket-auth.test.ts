import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import type { Socket } from "socket.io";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import User from "@/model/user.model";

const tokenState = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("next-auth/jwt", () => ({
  getToken: () => Promise.resolve(tokenState.value),
}));

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let getSocketUser: typeof import("./socket-auth").getSocketUser;
const socket = {
  request: { headers: { cookie: "", authorization: "" } },
} as unknown as Socket;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  process.env.AUTH_SECRET = "test-secret";
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  ({ getSocketUser } = await import("./socket-auth"));
});

afterEach(async () => {
  tokenState.value = null;
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("socket session validation", () => {
  it("rejects tokens missing a sessionVersion stamp", async () => {
    const user = await User.create({
      name: "U",
      email: "u@x.com",
      role: "user",
    });
    tokenState.value = { id: user._id.toString() };
    expect(await getSocketUser(socket)).toBeNull();
  });

  it("rejects deleted accounts and stale versions", async () => {
    const user = await User.create({
      name: "U",
      email: "u@x.com",
      role: "user",
      sessionVersion: 2,
    });
    tokenState.value = { id: user._id.toString(), sessionVersion: 1 };
    expect(await getSocketUser(socket)).toBeNull();
    await User.deleteOne({ _id: user._id });
    tokenState.value = { id: user._id.toString(), sessionVersion: 2 };
    expect(await getSocketUser(socket)).toBeNull();
  });

  it("returns fresh database claims for a current token", async () => {
    const user = await User.create({
      name: "Fresh Name",
      email: "fresh@x.com",
      role: "vendor",
      sessionVersion: 3,
    });
    tokenState.value = {
      id: user._id.toString(),
      sessionVersion: 3,
      role: "user",
    };
    expect(await getSocketUser(socket)).toMatchObject({
      id: user._id.toString(),
      role: "vendor",
      email: "fresh@x.com",
      name: "Fresh Name",
    });
  });
});
