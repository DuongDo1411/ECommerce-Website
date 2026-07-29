import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import type { JWT } from "next-auth/jwt";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import User from "@/model/user.model";
import LoginChallenge from "@/model/loginChallenge.model";
import TrustedDevice from "@/model/trustedDevice.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let applySessionState: typeof import("./sessionToken").applySessionState;
let revokeAllSessions: typeof import("@/lib/security/session").revokeAllSessions;

async function seedUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    name: "U",
    email: "u@x.com",
    role: "user",
    ...overrides,
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
  applySessionState = (await import("./sessionToken")).applySessionState;
  revokeAllSessions = (await import("@/lib/security/session")).revokeAllSessions;
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    LoginChallenge.deleteMany({}),
    TrustedDevice.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("applySessionState", () => {
  it("stamps the account's current version when signing in", async () => {
    const user = await seedUser({ sessionVersion: 4 });
    const token: JWT = { id: user._id.toString() };

    const result = await applySessionState(token, true);

    expect(result?.sessionVersion).toBe(4);
    expect(result?.role).toBe("user");
  });

  it("keeps a token whose stamp still matches and refreshes its claims", async () => {
    const user = await seedUser({ sessionVersion: 1 });
    await User.updateOne({ _id: user._id }, { role: "vendor", name: "Renamed" });

    const result = await applySessionState(
      { id: user._id.toString(), sessionVersion: 1 },
      false,
    );

    expect(result).not.toBeNull();
    expect(result?.role).toBe("vendor");
    expect(result?.name).toBe("Renamed");
  });

  it("rejects a token minted before the sessions were revoked", async () => {
    const user = await seedUser({ sessionVersion: 1 });
    const token: JWT = { id: user._id.toString(), sessionVersion: 1 };

    await revokeAllSessions(user._id.toString());

    expect(await applySessionState(token, false)).toBeNull();
  });

  it("rejects a legacy token that has no sessionVersion stamp", async () => {
    const user = await seedUser();
    const token: JWT = { id: user._id.toString() };
    expect(await applySessionState(token, false)).toBeNull();
  });

  it("rejects a token after its account has been deleted", async () => {
    const user = await seedUser({ sessionVersion: 0 });
    const token: JWT = { id: user._id.toString(), sessionVersion: 0 };
    await User.deleteOne({ _id: user._id });
    expect(await applySessionState(token, false)).toBeNull();
  });

  it("rejects a token when the stored sessionVersion is missing", async () => {
    const user = await seedUser();
    await User.collection.updateOne(
      { _id: user._id },
      { $unset: { sessionVersion: "" } },
    );
    expect(
      await applySessionState(
        { id: user._id.toString(), sessionVersion: 0 },
        false,
      ),
    ).toBeNull();
  });
});
