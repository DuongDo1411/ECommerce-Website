import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import connectDB from "@/lib/connectDB";
import type { LoginRole } from "@/lib/roleRoutes";
import {
  deviceLabel,
  hashDeviceId,
  rememberTrustedDevice,
  touchTrustedDevice,
} from "@/lib/security/device";
import { emailIdentityFilter, normalizeEmail } from "@/lib/security/email";
import { generateOtp, generateToken, hashOtp, hashToken } from "@/lib/security/otp";
import { BCRYPT_COST } from "@/lib/security/password";
import { rateLimit } from "@/lib/security/rateLimit";
import LoginChallenge from "@/model/loginChallenge.model";
import User from "@/model/user.model";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const GRANT_TTL_MS = 2 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

const FAKE_PASSWORD_HASH =
  "$2b$12$xIx0NlfEkEtaKduw9auueeKdpH2YeVM4siL6U0ZCP4QwXB8j1jdWy";

export type PortalUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type ConsumedPortalUser = PortalUser & { newDevice: boolean };

export type InitiateResult =
  | { step: "ready"; loginGrant: string; userId: string }
  | {
      step: "otp";
      challengeId: string;
      otp?: string;
      email: string;
      userId: string;
    }
  | { step: "limited"; userId: string }
  | { step: "rejected"; userId?: string };

export type VerifyOtpResult =
  | { ok: true; loginGrant: string; userId: string }
  | { ok: false; reason: "invalid" | "locked"; userId?: string };

type TwoFactorAction = "enable" | "disable";

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

async function issueLoginGrant(
  user: { _id: unknown; email?: string; role: string },
  deviceIdHash: string,
  viaOtp: boolean,
): Promise<string> {
  const loginGrant = generateToken();
  const now = new Date();
  await LoginChallenge.findOneAndUpdate(
    { userId: user._id, deviceIdHash },
    {
      $set: {
        userId: user._id,
        emailNormalized: normalizeEmail(user.email),
        role: user.role,
        purpose: "login",
        deviceIdHash,
        grantHash: hashToken(loginGrant),
        grantViaOtp: viaOtp,
        grantExpiresAt: new Date(now.getTime() + GRANT_TTL_MS),
        attempts: 0,
        expiresAt: new Date(now.getTime() + GRANT_TTL_MS + 60_000),
      },
      $unset: {
        action: "",
        otpHash: "",
        otpExpiresAt: "",
        consumedAt: "",
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  return loginGrant;
}

async function existingLiveOtp(userId: unknown, deviceIdHash: string) {
  return LoginChallenge.findOne({
    userId,
    deviceIdHash,
    purpose: "login",
    otpHash: { $exists: true },
    otpExpiresAt: { $gt: new Date() },
    consumedAt: { $exists: false },
  }).select("_id attempts");
}

export async function initiateLogin(params: {
  email: unknown;
  password: unknown;
  expectedRole: LoginRole;
  deviceId: string;
}): Promise<InitiateResult> {
  const { email, password, expectedRole, deviceId } = params;
  const emailNormalized = normalizeEmail(email);
  if (!emailNormalized || typeof password !== "string" || password.length === 0) {
    return { step: "rejected" };
  }

  await connectDB();
  const user = await User.findOne(emailIdentityFilter(emailNormalized)).select(
    "+password email emailVerifiedAt name role twoFactorEnabled",
  );

  if (!user || typeof user.password !== "string") {
    await bcrypt.compare(password, FAKE_PASSWORD_HASH);
    return user
      ? { step: "rejected", userId: user._id.toString() }
      : { step: "rejected" };
  }

  const userId = user._id.toString();
  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) return { step: "rejected", userId };

  const cost = Number.parseInt(user.password.split("$")[2] ?? "", 10);
  if (Number.isFinite(cost) && cost < BCRYPT_COST) {
    user.password = await bcrypt.hash(password, BCRYPT_COST);
    await user.save();
  }

  if (user.role !== expectedRole) {
    return { step: "rejected", userId };
  }

  const deviceIdHash = hashDeviceId(deviceId);
  // 2FA tắt → cho vào ngay, không động tới thiết bị tin cậy (không tạo device).
  if (user.twoFactorEnabled !== true) {
    return {
      step: "ready",
      loginGrant: await issueLoginGrant(user, deviceIdHash, false),
      userId,
    };
  }
  // 2FA bật: thiết bị đã xác thực (còn hạn 30 ngày) thì bỏ qua OTP.
  const trusted = await touchTrustedDevice(userId, deviceIdHash);
  if (trusted) {
    return {
      step: "ready",
      loginGrant: await issueLoginGrant(user, deviceIdHash, false),
      userId,
    };
  }

  const active = await existingLiveOtp(user._id, deviceIdHash);
  if (active) {
    if (active.attempts >= MAX_OTP_ATTEMPTS) {
      return { step: "limited", userId };
    }
    return {
      step: "otp",
      challengeId: active._id.toString(),
      email: user.email as string,
      userId,
    };
  }

  const issueAllowed = await rateLimit(`login-otp:issue:acct:${userId}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!issueAllowed) return { step: "limited", userId };

  const otp = generateOtp();
  const now = new Date();
  try {
    const challenge = await LoginChallenge.findOneAndUpdate(
      {
        userId: user._id,
        deviceIdHash,
        $or: [
          { purpose: { $ne: "login" } },
          { otpExpiresAt: { $lte: now } },
          { otpExpiresAt: { $exists: false } },
          { consumedAt: { $exists: true } },
          { grantHash: { $exists: true } },
        ],
      },
      {
        $set: {
          userId: user._id,
          emailNormalized,
          role: user.role,
          purpose: "login",
          deviceIdHash,
          otpHash: hashOtp(otp),
          otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
          attempts: 0,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS + 5 * 60_000),
        },
        $unset: {
          action: "",
          grantHash: "",
          grantExpiresAt: "",
          consumedAt: "",
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    return {
      step: "otp",
      challengeId: challenge._id.toString(),
      otp,
      email: user.email as string,
      userId,
    };
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const winner = await existingLiveOtp(user._id, deviceIdHash);
    if (!winner) throw error;
    return {
      step: "otp",
      challengeId: winner._id.toString(),
      email: user.email as string,
      userId,
    };
  }
}

export async function verifyLoginOtp(params: {
  challengeId: unknown;
  otp: unknown;
  deviceId: string;
}): Promise<VerifyOtpResult> {
  const { challengeId, otp, deviceId } = params;
  if (
    typeof challengeId !== "string" ||
    !mongoose.isValidObjectId(challengeId) ||
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp.trim())
  ) {
    return { ok: false, reason: "invalid" };
  }

  await connectDB();
  const now = new Date();
  const deviceIdHash = hashDeviceId(deviceId);
  const submittedHash = hashOtp(otp.trim());
  const loginGrant = generateToken();
  const challengeOwner = await LoginChallenge.findOne({
    _id: challengeId,
    purpose: "login",
    deviceIdHash,
  }).select("userId");
  if (!challengeOwner) return { ok: false, reason: "invalid" };
  const accountAllowed = await rateLimit(
    `login-otp:verify:acct:${challengeOwner.userId.toString()}`,
    { max: 20, windowMs: 60 * 60 * 1000 },
  );
  if (!accountAllowed) {
    return {
      ok: false,
      reason: "locked",
      userId: challengeOwner.userId.toString(),
    };
  }

  const accepted = await LoginChallenge.findOneAndUpdate(
    {
      _id: challengeId,
      purpose: "login",
      deviceIdHash,
      otpHash: submittedHash,
      otpExpiresAt: { $gt: now },
      attempts: { $lt: MAX_OTP_ATTEMPTS },
      consumedAt: { $exists: false },
    },
    {
      $set: {
        grantHash: hashToken(loginGrant),
        grantViaOtp: true,
        grantExpiresAt: new Date(now.getTime() + GRANT_TTL_MS),
        expiresAt: new Date(now.getTime() + GRANT_TTL_MS + 60_000),
      },
      $unset: { otpHash: "", otpExpiresAt: "" },
    },
    { returnDocument: "after" },
  ).select("userId");

  if (accepted) {
    return {
      ok: true,
      loginGrant,
      userId: accepted.userId.toString(),
    };
  }

  const failed = await LoginChallenge.findOneAndUpdate(
    {
      _id: challengeId,
      purpose: "login",
      deviceIdHash,
      otpHash: { $exists: true, $ne: submittedHash },
      otpExpiresAt: { $gt: now },
      attempts: { $lt: MAX_OTP_ATTEMPTS },
      consumedAt: { $exists: false },
    },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).select("userId attempts");

  if (failed) {
    return {
      ok: false,
      reason:
        failed.attempts >= MAX_OTP_ATTEMPTS ? "locked" : "invalid",
      userId: failed.userId.toString(),
    };
  }

  const state = await LoginChallenge.findById(challengeId).select(
    "userId attempts",
  );
  return {
    ok: false,
    reason:
      (state?.attempts ?? 0) >= MAX_OTP_ATTEMPTS ? "locked" : "invalid",
    userId: state?.userId?.toString(),
  };
}

export async function consumeGrant(params: {
  rawGrant: string;
  expectedRole: LoginRole;
  deviceIdHash: string;
  userAgent?: string | null;
}): Promise<ConsumedPortalUser | null> {
  if (!/^[a-f0-9]{64}$/i.test(params.rawGrant)) return null;
  await connectDB();

  const challenge = await LoginChallenge.findOneAndUpdate(
    {
      purpose: "login",
      role: params.expectedRole,
      deviceIdHash: params.deviceIdHash,
      grantHash: hashToken(params.rawGrant),
      consumedAt: { $exists: false },
      grantExpiresAt: { $gt: new Date() },
    },
    { $set: { consumedAt: new Date() } },
    { returnDocument: "after" },
  ).select("userId grantViaOtp");
  if (!challenge) return null;

  const user = await User.findById(challenge.userId).select(
    "email name role emailVerifiedAt",
  );
  if (!user || user.role !== params.expectedRole) {
    return null;
  }

  // Chỉ ghi thiết bị tin cậy khi grant đến từ đường OTP (2FA bật + đã nhập mã).
  // Grant "ready" (2FA tắt / thiết bị đã tin cậy) không tạo thiết bị mới.
  let newDevice = false;
  if (challenge.grantViaOtp === true) {
    ({ newDevice } = await rememberTrustedDevice({
      userId: user._id.toString(),
      deviceIdHash: params.deviceIdHash,
      label: deviceLabel(params.userAgent),
    }));
    // A passed login OTP proves email ownership — backfill if never set.
    if (!user.emailVerifiedAt) {
      await User.updateOne(
        { _id: user._id },
        { $set: { emailVerifiedAt: new Date() } },
      );
    }
  }

  return {
    id: user._id.toString(),
    email: user.email as string,
    name: user.name as string,
    role: user.role,
    newDevice,
  };
}

export async function initiateTwoFactorChange(params: {
  userId: string;
  action: TwoFactorAction;
  deviceId: string;
}): Promise<
  | { ok: true; challengeId: string; otp?: string; email: string }
  | { ok: false; reason: "invalid_state" | "not_found" | "locked" }
> {
  await connectDB();
  const user = await User.findById(params.userId).select(
    "email emailVerifiedAt role twoFactorEnabled",
  );
  // Không yêu cầu emailVerifiedAt sẵn có: chính bước bật 2FA này (gửi + xác nhận
  // OTP) mới là lúc chứng minh quyền sở hữu email; verify hoàn tất set nó.
  if (!user || !user.email) {
    return { ok: false, reason: "not_found" };
  }
  const enabling = params.action === "enable";
  if (user.twoFactorEnabled === enabling) {
    return { ok: false, reason: "invalid_state" };
  }

  const deviceIdHash = hashDeviceId(params.deviceId);
  const now = new Date();
  const existing = await LoginChallenge.findOne({
    userId: user._id,
    deviceIdHash,
    purpose: "two_factor_change",
    action: params.action,
    otpHash: { $exists: true },
    otpExpiresAt: { $gt: now },
    consumedAt: { $exists: false },
  }).select("_id attempts");
  if (existing) {
    if (existing.attempts >= MAX_OTP_ATTEMPTS) {
      return { ok: false, reason: "locked" };
    }
    return {
      ok: true,
      challengeId: existing._id.toString(),
      email: user.email,
    };
  }

  const otp = generateOtp();
  try {
    const challenge = await LoginChallenge.findOneAndUpdate(
      {
        userId: user._id,
        deviceIdHash,
        $or: [
          { purpose: { $ne: "two_factor_change" } },
          { action: { $ne: params.action } },
          { otpExpiresAt: { $lte: now } },
          { otpExpiresAt: { $exists: false } },
          { consumedAt: { $exists: true } },
        ],
      },
      {
        $set: {
          userId: user._id,
          emailNormalized: normalizeEmail(user.email),
          role: user.role,
          purpose: "two_factor_change",
          action: params.action,
          deviceIdHash,
          otpHash: hashOtp(otp),
          otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
          attempts: 0,
          expiresAt: new Date(now.getTime() + OTP_TTL_MS + 5 * 60_000),
        },
        $unset: { grantHash: "", grantExpiresAt: "", consumedAt: "" },
      },
      { upsert: true, returnDocument: "after" },
    );
    return {
      ok: true,
      challengeId: challenge._id.toString(),
      otp,
      email: user.email,
    };
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const winner = await LoginChallenge.findOne({
      userId: user._id,
      deviceIdHash,
      purpose: "two_factor_change",
      action: params.action,
      otpHash: { $exists: true },
      otpExpiresAt: { $gt: now },
    }).select("_id");
    if (!winner) throw error;
    return {
      ok: true,
      challengeId: winner._id.toString(),
      email: user.email,
    };
  }
}

export async function verifyTwoFactorChange(params: {
  userId: string;
  challengeId: unknown;
  otp: unknown;
  deviceId: string;
}): Promise<
  | { ok: true; action: TwoFactorAction }
  | { ok: false; reason: "invalid" | "locked" }
> {
  if (
    typeof params.challengeId !== "string" ||
    !mongoose.isValidObjectId(params.challengeId) ||
    typeof params.otp !== "string" ||
    !/^\d{6}$/.test(params.otp.trim())
  ) {
    return { ok: false, reason: "invalid" };
  }
  await connectDB();
  if (
    !(await rateLimit(`2fa:verify:acct:${params.userId}`, {
      max: 20,
      windowMs: 60 * 60 * 1000,
    }))
  ) {
    return { ok: false, reason: "locked" };
  }
  const now = new Date();
  const submittedHash = hashOtp(params.otp.trim());
  const baseFilter = {
    _id: params.challengeId,
    userId: params.userId,
    purpose: "two_factor_change",
    deviceIdHash: hashDeviceId(params.deviceId),
    otpExpiresAt: { $gt: now },
    attempts: { $lt: MAX_OTP_ATTEMPTS },
    consumedAt: { $exists: false },
  };

  const accepted = await LoginChallenge.findOneAndUpdate(
    { ...baseFilter, otpHash: submittedHash },
    { $set: { consumedAt: now }, $unset: { otpHash: "", otpExpiresAt: "" } },
    { returnDocument: "after" },
  ).select("action");
  if (accepted?.action) return { ok: true, action: accepted.action };

  const failed = await LoginChallenge.findOneAndUpdate(
    { ...baseFilter, otpHash: { $exists: true, $ne: submittedHash } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).select("attempts");
  if (failed?.attempts && failed.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, reason: "locked" };
  }
  const state = await LoginChallenge.findById(params.challengeId).select(
    "attempts",
  );
  return {
    ok: false,
    reason:
      (state?.attempts ?? 0) >= MAX_OTP_ATTEMPTS ? "locked" : "invalid",
  };
}

/**
 * Drops a login challenge whose OTP could not be delivered, so a user is never
 * left staring at a code that was never emailed. Best-effort; safe to no-op.
 */
export async function invalidateLoginChallenge(
  challengeId: string,
): Promise<void> {
  if (!mongoose.isValidObjectId(challengeId)) return;
  await connectDB();
  await LoginChallenge.deleteOne({ _id: challengeId, purpose: "login" });
}

export type ResendLoginOtpResult =
  | { ok: true; otp: string; email: string; userId: string }
  | { ok: false; reason: "invalid" | "cooldown" | "limited" };

/**
 * Rotates the OTP on an existing login challenge (user asked to resend). Old
 * code is invalidated and the attempt counter reset. Enforces a 60s cooldown
 * and 5/hour per account; the caller adds the per-IP cap.
 */
export async function resendLoginOtp(params: {
  challengeId: unknown;
  deviceId: string;
}): Promise<ResendLoginOtpResult> {
  const { challengeId, deviceId } = params;
  if (typeof challengeId !== "string" || !mongoose.isValidObjectId(challengeId)) {
    return { ok: false, reason: "invalid" };
  }
  await connectDB();
  const deviceIdHash = hashDeviceId(deviceId);
  const challenge = await LoginChallenge.findOne({
    _id: challengeId,
    purpose: "login",
    deviceIdHash,
    consumedAt: { $exists: false },
    otpExpiresAt: { $exists: true },
  }).select("userId");
  if (!challenge) return { ok: false, reason: "invalid" };

  const userId = challenge.userId.toString();
  const cooldownOk = await rateLimit(`login-otp:resend:cd:acct:${userId}`, {
    max: 1,
    windowMs: 60 * 1000,
  });
  if (!cooldownOk) return { ok: false, reason: "cooldown" };
  const acctOk = await rateLimit(`login-otp:resend:acct:${userId}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!acctOk) return { ok: false, reason: "limited" };

  const user = await User.findById(userId).select("email");
  if (!user?.email) return { ok: false, reason: "invalid" };

  const otp = generateOtp();
  const now = new Date();
  const updated = await LoginChallenge.updateOne(
    {
      _id: challengeId,
      purpose: "login",
      deviceIdHash,
      consumedAt: { $exists: false },
    },
    {
      $set: {
        otpHash: hashOtp(otp),
        otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        attempts: 0,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS + 5 * 60_000),
      },
      $unset: { grantHash: "", grantViaOtp: "", grantExpiresAt: "" },
    },
  );
  if (updated.matchedCount !== 1) return { ok: false, reason: "invalid" };
  return { ok: true, otp, email: user.email, userId };
}

/** Drops a two-factor-change challenge whose OTP could not be delivered. */
export async function invalidateTwoFactorChange(
  challengeId: string,
): Promise<void> {
  if (!mongoose.isValidObjectId(challengeId)) return;
  await connectDB();
  await LoginChallenge.deleteOne({
    _id: challengeId,
    purpose: "two_factor_change",
  });
}

export type ResendTwoFactorResult =
  | { ok: true; otp: string; email: string; action: "enable" | "disable" }
  | { ok: false; reason: "invalid" | "cooldown" | "limited" };

/**
 * Rotates the OTP on an authenticated user's own two-factor-change challenge.
 * Old code is invalidated; 60s cooldown + 5/hour per account (caller adds IP).
 */
export async function resendTwoFactorOtp(params: {
  userId: string;
  challengeId: unknown;
  deviceId: string;
}): Promise<ResendTwoFactorResult> {
  const { userId, challengeId, deviceId } = params;
  if (typeof challengeId !== "string" || !mongoose.isValidObjectId(challengeId)) {
    return { ok: false, reason: "invalid" };
  }
  await connectDB();
  const deviceIdHash = hashDeviceId(deviceId);
  const challenge = await LoginChallenge.findOne({
    _id: challengeId,
    userId,
    purpose: "two_factor_change",
    deviceIdHash,
    consumedAt: { $exists: false },
    otpExpiresAt: { $exists: true },
  }).select("action");
  if (!challenge) return { ok: false, reason: "invalid" };

  const cooldownOk = await rateLimit(`2fa:resend:cd:acct:${userId}`, {
    max: 1,
    windowMs: 60 * 1000,
  });
  if (!cooldownOk) return { ok: false, reason: "cooldown" };
  const acctOk = await rateLimit(`2fa:resend:acct:${userId}`, {
    max: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!acctOk) return { ok: false, reason: "limited" };

  const user = await User.findById(userId).select("email");
  if (!user?.email) return { ok: false, reason: "invalid" };

  const otp = generateOtp();
  const now = new Date();
  const updated = await LoginChallenge.updateOne(
    {
      _id: challengeId,
      userId,
      purpose: "two_factor_change",
      deviceIdHash,
      consumedAt: { $exists: false },
    },
    {
      $set: {
        otpHash: hashOtp(otp),
        otpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        attempts: 0,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS + 5 * 60_000),
      },
    },
  );
  if (updated.matchedCount !== 1) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    otp,
    email: user.email,
    action: (challenge.action as "enable" | "disable") ?? "enable",
  };
}
