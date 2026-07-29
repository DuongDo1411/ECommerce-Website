import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { resendTwoFactorOtp } from "@/lib/auth/loginChallenge";
import { sendTwoFactorOtpEmail } from "@/lib/mailer";
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

    const ip = clientIp(req.headers);
    if (
      ip &&
      !(await rateLimit(`2fa:resend:ip:${ip}`, {
        max: 20,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return NextResponse.json(
        { message: "Bạn đã yêu cầu quá nhiều. Vui lòng thử lại sau." },
        { status: 429, headers: { ...NO_STORE, "Retry-After": "3600" } },
      );
    }

    const { challengeId } = await req.json();
    const deviceId = readOrCreateDeviceId(req);
    const result = await resendTwoFactorOtp({
      userId: session.user.id,
      challengeId,
      deviceId,
    });

    if (!result.ok) {
      if (result.reason === "invalid") {
        return attachDeviceCookie(
          NextResponse.json(
            { message: "Yêu cầu không hợp lệ hoặc đã hết hạn." },
            { status: 404, headers: NO_STORE },
          ),
          deviceId,
        );
      }
      const retryAfter = result.reason === "cooldown" ? 60 : 3600;
      return attachDeviceCookie(
        NextResponse.json(
          { message: "Vui lòng chờ trước khi gửi lại mã." },
          { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
        ),
        deviceId,
      );
    }

    try {
      await sendTwoFactorOtpEmail(result.email, result.otp, result.action);
    } catch (mailError) {
      console.error("[mail] 2FA OTP resend failed", mailError);
      return attachDeviceCookie(
        NextResponse.json(
          { message: "Không gửi được mã. Vui lòng thử lại." },
          { status: 503, headers: NO_STORE },
        ),
        deviceId,
      );
    }

    return attachDeviceCookie(
      NextResponse.json(
        { message: "Đã gửi lại mã xác nhận." },
        { status: 200, headers: NO_STORE },
      ),
      deviceId,
    );
  } catch (error) {
    console.error("2FA OTP resend failed", error);
    return NextResponse.json(
      { message: "Không thể gửi lại mã lúc này." },
      { status: 500, headers: NO_STORE },
    );
  }
}
