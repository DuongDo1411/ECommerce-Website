import bcrypt from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import User from "@/model/user.model";

// `./portalCredentials` transitively imports connectDB, which throws at
// module-load when MONGODB_URL is unset. Import it lazily in beforeAll (below)
// once the in-memory Mongo URI is in the environment.
let authorizePortalCredentials: typeof import("./portalCredentials").authorizePortalCredentials;

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
  ({ authorizePortalCredentials } = await import("./portalCredentials"));
});

afterEach(async () => {
  await User.deleteMany({});
  vi.restoreAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

async function seedUser(
  role: "user" | "vendor" | "admin",
  password = "Secret123",
) {
  return User.create({
    name: `${role} name`,
    email: `${role}@example.com`,
    password: await bcrypt.hash(password, 10),
    role,
  });
}

describe("authorizePortalCredentials", () => {
  it("returns a safe user when both password and role match", async () => {
    await seedUser("user");

    const result = await authorizePortalCredentials(
      { email: "user@example.com", password: "Secret123" },
      "user",
    );

    expect(result).toMatchObject({
      email: "user@example.com",
      name: "user name",
      role: "user",
    });
    expect(result?.id).toBeTruthy();
    // Never leak the password hash into the session payload.
    expect(result).not.toHaveProperty("password");
  });

  it("returns null when the password is correct but the role differs", async () => {
    await seedUser("vendor");

    const result = await authorizePortalCredentials(
      { email: "vendor@example.com", password: "Secret123" },
      "user",
    );

    expect(result).toBeNull();
  });

  it("returns null for a wrong password", async () => {
    await seedUser("user");

    const result = await authorizePortalCredentials(
      { email: "user@example.com", password: "wrong-password" },
      "user",
    );

    expect(result).toBeNull();
  });

  it("returns null when the password field is missing", async () => {
    await seedUser("user");

    const result = await authorizePortalCredentials(
      { email: "user@example.com" },
      "user",
    );

    expect(result).toBeNull();
  });

  it("returns null when the user does not exist", async () => {
    const result = await authorizePortalCredentials(
      { email: "ghost@example.com", password: "Secret123" },
      "user",
    );

    expect(result).toBeNull();
  });

  it("propagates unexpected database errors instead of masking them as bad credentials", async () => {
    await seedUser("user");
    const model = User as unknown as {
      findOne: (...args: unknown[]) => unknown;
    };
    vi.spyOn(model, "findOne").mockImplementationOnce(() => {
      throw new Error("db down");
    });

    await expect(
      authorizePortalCredentials(
        { email: "user@example.com", password: "Secret123" },
        "user",
      ),
    ).rejects.toThrow("db down");
  });
});
