import bcrypt from "bcryptjs";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import LoginActivity from "@/model/loginActivity.model";
import LoginChallenge from "@/model/loginChallenge.model";
import TrustedDevice from "@/model/trustedDevice.model";
import User from "@/model/user.model";

const authState: { value: { user?: { id: string } } | null } = { value: null };
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(authState.value) }));
const { sendTwoFactorOtpEmail } = vi.hoisted(() => ({
  sendTwoFactorOtpEmail: vi.fn(async () => undefined),
}));
vi.mock("@/lib/mailer", () => ({ sendTwoFactorOtpEmail }));

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let activityGET: typeof import("./activity/route").GET;
let twoFactorInitiatePOST: typeof import("./2fa/initiate/route").POST;
let twoFactorConfirmPOST: typeof import("./2fa/confirm/route").POST;
let logoutAllPOST: typeof import("./logout-all/route").POST;
let devicesGET: typeof import("./devices/route").GET;
let deviceDELETE: typeof import("./devices/[id]/route").DELETE;
let recordLoginActivity: typeof import("@/lib/security/loginActivity").recordLoginActivity;
let hashDeviceId: typeof import("@/lib/security/device").hashDeviceId;

const PASSWORD = "correct horse battery";
const DEVICE = "c".repeat(64);

const request = (method = "GET", body?: unknown) =>
  new NextRequest("http://localhost/api/user/security", {
    method,
    headers: { cookie: `ecoshop_did=${DEVICE}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seedUser(email: string, twoFactorEnabled = false) {
  return User.create({
    name: "U",
    email,
    emailNormalized: email,
    emailVerifiedAt: new Date(),
    password: await bcrypt.hash(PASSWORD, 10),
    role: "user",
    twoFactorEnabled,
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
  activityGET = (await import("./activity/route")).GET;
  twoFactorInitiatePOST = (await import("./2fa/initiate/route")).POST;
  twoFactorConfirmPOST = (await import("./2fa/confirm/route")).POST;
  logoutAllPOST = (await import("./logout-all/route")).POST;
  devicesGET = (await import("./devices/route")).GET;
  deviceDELETE = (await import("./devices/[id]/route")).DELETE;
  recordLoginActivity = (await import("@/lib/security/loginActivity"))
    .recordLoginActivity;
  hashDeviceId = (await import("@/lib/security/device")).hashDeviceId;
});

afterEach(async () => {
  authState.value = null;
  sendTwoFactorOtpEmail.mockClear();
  await Promise.all([
    User.deleteMany({}),
    LoginActivity.deleteMany({}),
    LoginChallenge.deleteMany({}),
    TrustedDevice.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("security activity", () => {
  it("returns only the caller's own attempts without device hashes", async () => {
    const me = await seedUser("me@x.com");
    const other = await seedUser("other@x.com");
    await recordLoginActivity({
      userId: me._id.toString(),
      success: false,
      ip: "1.1.1.1",
      userAgent: "Chrome",
      deviceIdHash: "hash-a",
    });
    await recordLoginActivity({
      userId: other._id.toString(),
      success: true,
      ip: "2.2.2.2",
      userAgent: "Firefox",
      deviceIdHash: "hash-b",
    });
    authState.value = { user: { id: me._id.toString() } };
    const body = await (await activityGET(request())).json();
    expect(body.activity).toHaveLength(1);
    expect(body.activity[0]).toMatchObject({ ip: "1.1.1.1", success: false });
    expect(body.activity[0]).not.toHaveProperty("deviceIdHash");
  });

  it("rejects anonymous activity requests", async () => {
    expect((await activityGET(request())).status).toBe(401);
  });
});

describe("two-step email verification", () => {
  it("requires an emailed OTP to enable and revokes all existing credentials", async () => {
    const user = await seedUser("me@x.com", false);
    authState.value = { user: { id: user._id.toString() } };
    await TrustedDevice.create({
      userId: user._id,
      deviceIdHash: hashDeviceId(DEVICE),
      label: "Browser",
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const initiate = await twoFactorInitiatePOST(
      request("POST", { action: "enable" }),
    );
    expect(initiate.status).toBe(202);
    const { challengeId } = await initiate.json();
    await vi.waitFor(() => expect(sendTwoFactorOtpEmail).toHaveBeenCalledOnce());
    const code = (sendTwoFactorOtpEmail.mock.calls[0] as string[])[1];

    expect(
      (
        await twoFactorConfirmPOST(
          request("POST", { challengeId, code: "000000" }),
        )
      ).status,
    ).toBe(400);
    expect((await User.findById(user._id))?.twoFactorEnabled).toBe(false);

    const confirmed = await twoFactorConfirmPOST(
      request("POST", { challengeId, code }),
    );
    expect(confirmed.status).toBe(200);
    const fresh = await User.findById(user._id);
    expect(fresh?.twoFactorEnabled).toBe(true);
    expect(fresh?.sessionVersion).toBe(1);
    expect(
      await TrustedDevice.countDocuments({ revokedAt: { $exists: false } }),
    ).toBe(0);
    expect(await LoginChallenge.countDocuments()).toBe(0);
  });

  it("requires OTP when disabling as well", async () => {
    const user = await seedUser("me@x.com", true);
    authState.value = { user: { id: user._id.toString() } };
    const initiate = await twoFactorInitiatePOST(
      request("POST", { action: "disable" }),
    );
    const { challengeId } = await initiate.json();
    await vi.waitFor(() => expect(sendTwoFactorOtpEmail).toHaveBeenCalledOnce());
    const code = (sendTwoFactorOtpEmail.mock.calls[0] as string[])[1];
    expect(
      (
        await twoFactorConfirmPOST(
          request("POST", { challengeId, code }),
        )
      ).status,
    ).toBe(200);
    expect((await User.findById(user._id))?.twoFactorEnabled).toBe(false);
  });
});

describe("trusted devices and logout-all", () => {
  it("lists narrow DTOs and revokes one caller-owned device", async () => {
    const user = await seedUser("me@x.com");
    authState.value = { user: { id: user._id.toString() } };
    const device = await TrustedDevice.create({
      userId: user._id,
      deviceIdHash: hashDeviceId(DEVICE),
      label: "Browser",
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const body = await (await devicesGET(request())).json();
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).toMatchObject({ thisDevice: true, label: "Browser" });
    expect(body.devices[0]).not.toHaveProperty("deviceIdHash");

    const response = await deviceDELETE(request("DELETE"), {
      params: Promise.resolve({ id: device._id.toString() }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(
      await TrustedDevice.countDocuments({ revokedAt: { $exists: false } }),
    ).toBe(0);
  });

  it("logout-all bumps the version and clears devices and challenges", async () => {
    const user = await seedUser("me@x.com");
    authState.value = { user: { id: user._id.toString() } };
    await TrustedDevice.create({
      userId: user._id,
      deviceIdHash: hashDeviceId(DEVICE),
      label: "Browser",
      createdAt: new Date(),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await LoginChallenge.create({
      userId: user._id,
      emailNormalized: "me@x.com",
      role: "user",
      purpose: "login",
      deviceIdHash: hashDeviceId(DEVICE),
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect((await logoutAllPOST()).status).toBe(200);
    expect((await User.findById(user._id))?.sessionVersion).toBe(1);
    expect(await TrustedDevice.countDocuments()).toBe(0);
    expect(await LoginChallenge.countDocuments()).toBe(0);
  });
});
