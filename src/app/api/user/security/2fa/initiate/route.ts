import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import {
  initiateTwoFactorChange,
  invalidateTwoFactorChange,
} from "@/lib/auth/loginChallenge";
import { sendTwoFactorOtpEmail } from "@/lib/mailer";
import User from "@/model/user.model";
import {
  attachDeviceCookie,
  readOrCreateDeviceId,
} from "@/lib/security/device";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";

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

    // 2FA is for password-based User/Vendor accounts only. Admin is excluded and
    // pure-Google accounts (no password) have no email login path to protect.
    await connectDB();
    const account = await User.findById(session.user.id).select("+password role");
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

    const { action } = await req.json();
    if (action !== "enable" && action !== "disable") {
      return NextResponse.json(
        { message: "Hành động không hợp lệ." },
        { status: 400, headers: NO_STORE },
      );
    }

    const ip = clientIp(req.headers);
    const [accountAllowed, ipAllowed] = await Promise.all([
      rateLimit(`2fa:initiate:acct:${session.user.id}`, {
        max: 5,
        windowMs: 60 * 60 * 1000,
      }),
      ip
        ? rateLimit(`2fa:initiate:ip:${ip}`, {
            max: 20,
            windowMs: 60 * 60 * 1000,
          })
        : Promise.resolve(true),
    ]);
    if (!accountAllowed || !ipAllowed) {
      return NextResponse.json(
        { message: "Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau." },
        { status: 429, headers: NO_STORE },
      );
    }

    const deviceId = readOrCreateDeviceId(req);
    const result = await initiateTwoFactorChange({
      userId: session.user.id,
      action,
      deviceId,
    });
    if (!result.ok) {
      return attachDeviceCookie(
        NextResponse.json(
          {
            message:
              result.reason === "invalid_state"
                ? "Cài đặt này đã ở trạng thái bạn yêu cầu."
                : result.reason === "locked"
                  ? "Bạn đã nhập sai quá nhiều lần. Hãy thử lại sau khi mã hiện tại hết hạn."
                  : "Không tìm thấy tài khoản hợp lệ.",
          },
          {
            status:
              result.reason === "invalid_state"
                ? 409
                : result.reason === "locked"
                  ? 429
                  : 404,
            headers: NO_STORE,
          },
        ),
        deviceId,
      );
    }

    if (result.otp) {
      // Send synchronously so a delivery failure never leaves a challenge whose
      // code was never emailed — drop it and report 503.
      try {
        await sendTwoFactorOtpEmail(result.email, result.otp, action);
      } catch (mailError) {
        console.error("[mail] 2FA OTP failed", mailError);
        await invalidateTwoFactorChange(result.challengeId);
        return attachDeviceCookie(
          NextResponse.json(
            { message: "Không gửi được mã xác nhận. Vui lòng thử lại." },
            { status: 503, headers: NO_STORE },
          ),
          deviceId,
        );
      }
    }
    return attachDeviceCookie(
      NextResponse.json(
        { challengeId: result.challengeId, expiresInSeconds: 600 },
        { status: 202, headers: NO_STORE },
      ),
      deviceId,
    );
  } catch (error) {
    console.error("2FA initiation failed", error);
    return NextResponse.json(
      { message: "Không thể gửi mã xác nhận lúc này." },
      { status: 500, headers: NO_STORE },
    );
  }
}
