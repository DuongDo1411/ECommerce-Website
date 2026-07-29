import { NextRequest, NextResponse } from "next/server";

import { verifyLoginOtp } from "@/lib/auth/loginChallenge";
import {
  attachDeviceCookie,
  hashDeviceId,
  readOrCreateDeviceId,
} from "@/lib/security/device";
import { recordLoginActivity } from "@/lib/security/loginActivity";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  try {
    const { challengeId, code } = await req.json();
    const ip = clientIp(req.headers);
    if (
      ip &&
      !(await rateLimit(`login-otp:ip:${ip}`, {
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
    const result = await verifyLoginOtp({ challengeId, otp: code, deviceId });
    if (!result.ok) {
      if (result.userId) {
        await recordLoginActivity({
          userId: result.userId,
          success: false,
          ip: ip ?? "unknown",
          userAgent: req.headers.get("user-agent"),
          deviceIdHash: hashDeviceId(deviceId),
        });
      }
      return attachDeviceCookie(
        NextResponse.json(
          {
            message:
              result.reason === "locked"
                ? "Bạn đã nhập sai quá nhiều lần. Hãy đăng nhập lại sau khi mã hết hạn."
                : "Mã xác nhận không đúng hoặc đã hết hạn.",
          },
          {
            status: result.reason === "locked" ? 429 : 401,
            headers: NO_STORE,
          },
        ),
        deviceId,
      );
    }

    return attachDeviceCookie(
      NextResponse.json(
        { loginGrant: result.loginGrant },
        { status: 200, headers: NO_STORE },
      ),
      deviceId,
    );
  } catch (error) {
    console.error("Login OTP verification failed", error);
    return NextResponse.json(
      { message: "Không thể xác nhận mã lúc này. Vui lòng thử lại." },
      { status: 500, headers: NO_STORE },
    );
  }
}
