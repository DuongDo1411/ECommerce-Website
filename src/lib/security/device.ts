import mongoose from "mongoose";
import type { NextRequest, NextResponse } from "next/server";

import connectDB from "@/lib/connectDB";
import { generateToken, hashToken } from "@/lib/security/otp";
import TrustedDevice from "@/model/trustedDevice.model";

export const DEVICE_COOKIE = "ecoshop_did";
export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_COOKIE_MAX_AGE = TRUSTED_DEVICE_TTL_MS / 1000;
const MAX_TRUSTED_DEVICES = 10;
const DEVICE_ID_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_LABEL_LENGTH = 120;

export function hashDeviceId(deviceId: string): string {
  return hashToken(deviceId);
}

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_PATTERN.test(value);
}

export function readOrCreateDeviceId(req: NextRequest): string {
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  return isValidDeviceId(existing) ? existing : generateToken();
}

/** Reads the device cookie from Auth.js's standard Request object. */
export function readDeviceIdFromRequest(req: Pick<Request, "headers">):
  | string
  | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (name !== DEVICE_COOKIE) continue;
    const value = pair.slice(separator + 1).trim();
    return isValidDeviceId(value) ? value : null;
  }
  return null;
}

export function attachDeviceCookie<T extends NextResponse>(
  res: T,
  deviceId: string,
): T {
  if (!isValidDeviceId(deviceId)) return res;
  res.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  return res;
}

export function clearDeviceCookie<T extends NextResponse>(res: T): T {
  res.cookies.set(DEVICE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export function deviceLabel(userAgent: string | null | undefined): string {
  const clean = (userAgent ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return clean.slice(0, MAX_LABEL_LENGTH) || "Unknown device";
}

/**
 * Reports whether a device is still trusted and records that it was seen. The
 * expiry is ABSOLUTE — 30 days from the OTP that established trust — so logging
 * in does not extend it. Only `lastSeenAt` is refreshed; `expiresAt` is left
 * untouched, so on day 31 the device is stale and a fresh OTP is required.
 */
export async function touchTrustedDevice(
  userId: string,
  deviceIdHash: string,
): Promise<boolean> {
  await connectDB();
  const now = new Date();
  const trusted = await TrustedDevice.findOneAndUpdate(
    {
      userId,
      deviceIdHash,
      revokedAt: { $exists: false },
      expiresAt: { $gt: now },
    },
    { $set: { lastSeenAt: now } },
    { returnDocument: "after" },
  ).select("_id");
  return Boolean(trusted);
}

/** Persists trust only after Auth.js has redeemed the one-time login grant. */
export async function rememberTrustedDevice(params: {
  userId: string;
  deviceIdHash: string;
  label: string;
}): Promise<{ newDevice: boolean }> {
  await connectDB();
  const now = new Date();
  const existing = await TrustedDevice.findOne({
    userId: params.userId,
    deviceIdHash: params.deviceIdHash,
    revokedAt: { $exists: false },
    expiresAt: { $gt: now },
  })
    .select("_id")
    .lean();
  await TrustedDevice.findOneAndUpdate(
    { userId: params.userId, deviceIdHash: params.deviceIdHash },
    {
      $set: {
        label: params.label.slice(0, MAX_LABEL_LENGTH),
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS),
      },
      $setOnInsert: { createdAt: now },
      $unset: { revokedAt: "" },
    },
    { upsert: true, returnDocument: "after" },
  );

  const overflow = await TrustedDevice.find({
    userId: params.userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: now },
  })
    .sort({ lastSeenAt: -1, createdAt: -1 })
    .skip(MAX_TRUSTED_DEVICES)
    .select("_id")
    .lean();
  if (overflow.length > 0) {
    await TrustedDevice.deleteMany({
      _id: { $in: overflow.map((entry) => entry._id) },
      userId: params.userId,
    });
  }
  return { newDevice: !existing };
}

export async function listTrustedDevices(userId: string) {
  await connectDB();
  const now = new Date();
  return TrustedDevice.find({
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: now },
  })
    .sort({ lastSeenAt: -1 })
    .select("label createdAt lastSeenAt expiresAt deviceIdHash")
    .lean();
}

export async function revokeTrustedDevice(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  if (!mongoose.isValidObjectId(deviceId)) return false;
  await connectDB();
  const now = new Date();
  const result = await TrustedDevice.updateOne(
    {
      _id: deviceId,
      userId,
      revokedAt: { $exists: false },
    },
    { $set: { revokedAt: now, expiresAt: now } },
  );
  return result.modifiedCount === 1;
}
