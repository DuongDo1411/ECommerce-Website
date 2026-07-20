import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import User from "@/model/user.model";

// `./googleUser` transitively imports connectDB, which throws at module-load
// when MONGODB_URL is unset. Import it lazily in beforeAll (below) once the
// in-memory Mongo URI is in the environment.
let prepareGoogleUser: typeof import("./googleUser").prepareGoogleUser;

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  ({ prepareGoogleUser } = await import("./googleUser"));
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("prepareGoogleUser", () => {
  it("creates a new account with the user role and syncs id/role", async () => {
    const user: {
      email: string;
      name: string;
      image?: string;
      id?: string;
      role?: string;
    } = {
      email: "new@example.com",
      name: "New Person",
      image: "https://img.example/x.png",
    };

    const allowed = await prepareGoogleUser(user);

    expect(allowed).toBe(true);
    expect(user.role).toBe("user");
    expect(user.id).toBeTruthy();

    const doc = await User.findOne({ email: "new@example.com" });
    expect(doc?.role).toBe("user");
    expect(doc?.image).toBe("https://img.example/x.png");
  });

  it("allows an existing user and syncs id/role", async () => {
    const created = await User.create({
      name: "Existing",
      email: "u@example.com",
      role: "user",
    });
    const user: { email: string; id?: string; role?: string } = {
      email: "u@example.com",
    };

    const allowed = await prepareGoogleUser(user);

    expect(allowed).toBe(true);
    expect(user.role).toBe("user");
    expect(user.id).toBe(created._id.toString());
  });

  it("rejects an existing vendor/admin without touching the account", async () => {
    await User.create({
      name: "Seller",
      email: "v@example.com",
      role: "vendor",
    });
    const user: { email: string; id?: string; role?: string } = {
      email: "v@example.com",
    };

    const allowed = await prepareGoogleUser(user);

    expect(allowed).toBe(false);
    expect(user.id).toBeUndefined();
    expect(user.role).toBeUndefined();
  });
});
