import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

import connectDB from "@/lib/connectDB";
import { emailIdentityFilter, normalizeEmail } from "@/lib/security/email";
import { BCRYPT_COST, validatePasswordPolicy } from "@/lib/security/password";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { readLimitedJsonBody } from "@/lib/security/requestBody";
import { noStoreJson } from "@/lib/security/response";
import User from "@/model/user.model";

const MAX_BODY_BYTES = 4 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const ip = clientIp(req.headers);
    if (
      ip &&
      !(await rateLimit(`register:ip:${ip}`, {
        max: 10,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return noStoreJson(
        { message: "Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau." },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await readLimitedJsonBody(req, MAX_BODY_BYTES);
    } catch (parseError) {
      if (parseError instanceof RangeError) {
        return noStoreJson({ message: "Dữ liệu quá lớn." }, { status: 413 });
      }
      return noStoreJson({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
    }

    const record = (body ?? {}) as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const rawEmail =
      typeof record.email === "string" ? record.email.trim() : "";
    const password =
      typeof record.password === "string" ? record.password : "";

    if (!name || name.length > 120) {
      return noStoreJson({ message: "Tên không hợp lệ." }, { status: 400 });
    }
    if (!rawEmail || rawEmail.length > 254 || !EMAIL_PATTERN.test(rawEmail)) {
      return noStoreJson({ message: "Email không hợp lệ." }, { status: 400 });
    }

    const policy = await validatePasswordPolicy(password);
    if (!policy.ok) {
      return noStoreJson({ message: policy.reason }, { status: 400 });
    }

    const emailNormalized = normalizeEmail(rawEmail);
    const existing = await User.findOne(
      emailIdentityFilter(emailNormalized),
    ).select("_id");
    if (existing) {
      return noStoreJson({ message: "Email đã được sử dụng." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    // emailVerifiedAt is deliberately NOT set: the email is only "verified" once
    // a real OTP round-trip (enabling 2FA, or a login OTP) actually completes.
    await User.create({
      name,
      email: rawEmail,
      emailNormalized,
      password: passwordHash,
      role: "user",
      sessionVersion: 0,
      twoFactorEnabled: false,
    });

    // Narrow response — never serialize the user document or the password hash.
    return noStoreJson(
      { message: "Đăng ký thành công. Bạn có thể đăng nhập." },
      { status: 201 },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000
    ) {
      return noStoreJson({ message: "Email đã được sử dụng." }, { status: 409 });
    }
    console.error("register error", error);
    return noStoreJson(
      { message: "Không thể đăng ký lúc này." },
      { status: 500 },
    );
  }
}
