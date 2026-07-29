import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { verifyTwoFactorChange } from "@/lib/auth/loginChallenge";
import UserModel from "@/model/user.model";
import {
  clearDeviceCookie,
  readOrCreateDeviceId,
} from "@/lib/security/device";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import {
  disconnectUserSockets,
  revokeAccountSecurity,
} from "@/lib/security/session";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }

    // Same gate as initiate: password-based User/Vendor only.
    await connectDB();
    const account = await UserModel.findById(session.user.id).select(
      "+password role",
    );
    if (
      !account ||
      (account.role !== "user" && account.role !== "vendor") ||
      typeof account.password !== "string"
    ) {
      return NextResponse.json(
        { message: "Tài khoản này không dùng xác minh 2 bước qua email." },
        { status: 403, headers: NO_STORE },
      );
    }

    const { challengeId, code } = await req.json();
    const ip = clientIp(req.headers);
    if (
      ip &&
      !(await rateLimit(`2fa:confirm:ip:${ip}`, {
        max: 20,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return NextResponse.json(
        { message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau." },
        { status: 429, headers: NO_STORE },
      );
    }

    const deviceId = readOrCreateDeviceId(req);
    const verified = await verifyTwoFactorChange({
      userId: session.user.id,
      challengeId,
      otp: code,
      deviceId,
    });
    if (!verified.ok) {
      return NextResponse.json(
        {
          message:
            verified.reason === "locked"
              ? "Bạn đã nhập sai quá nhiều lần. Hãy yêu cầu mã mới sau khi mã hiện tại hết hạn."
              : "Mã xác nhận không đúng hoặc đã hết hạn.",
        },
        {
          status: verified.reason === "locked" ? 429 : 400,
          headers: NO_STORE,
        },
      );
    }

    const databaseSession = await mongoose.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        const enabling = verified.action === "enable";
        // Enabling proves email ownership (the OTP was delivered + entered), so
        // stamp emailVerifiedAt. Disabling keeps whatever verification existed.
        const found = await revokeAccountSecurity(session.user.id, {
          session: databaseSession,
          set: enabling
            ? { twoFactorEnabled: true, emailVerifiedAt: new Date() }
            : { twoFactorEnabled: false },
        });
        if (!found) throw new Error("Account not found");
      });
    } finally {
      await databaseSession.endSession();
    }
    disconnectUserSockets(session.user.id);

    return clearDeviceCookie(
      NextResponse.json(
        {
          twoFactorEnabled: verified.action === "enable",
          message:
            verified.action === "enable"
              ? "Đã bật xác minh đăng nhập hai bước qua email."
              : "Đã tắt xác minh đăng nhập hai bước qua email.",
        },
        { status: 200, headers: NO_STORE },
      ),
    );
  } catch (error) {
    console.error("2FA confirmation failed", error);
    return NextResponse.json(
      { message: "Không thể cập nhật cài đặt bảo mật." },
      { status: 500, headers: NO_STORE },
    );
  }
}
