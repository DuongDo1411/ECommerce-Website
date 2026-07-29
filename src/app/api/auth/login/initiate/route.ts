import { NextRequest, NextResponse } from "next/server";

import { initiateLogin, invalidateLoginChallenge } from "@/lib/auth/loginChallenge";
import { sendLoginOtpEmail } from "@/lib/mailer";
import type { LoginRole } from "@/lib/roleRoutes";
import { afterResponse } from "@/lib/security/afterResponse";
import {
  attachDeviceCookie,
  hashDeviceId,
  readOrCreateDeviceId,
} from "@/lib/security/device";
import { normalizeEmail } from "@/lib/security/email";
import { recordLoginActivity } from "@/lib/security/loginActivity";
import {
  checkLoginThrottle,
  clientIp,
  rateLimit,
  recordLoginFailure,
  resetLoginFailures,
} from "@/lib/security/rateLimit";

// Admin is intentionally excluded from the OTP/2FA login handshake.
const ROLES: LoginRole[] = ["user", "vendor"];
const GENERIC = "Email hoặc mật khẩu không đúng. Vui lòng thử lại.";
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest) {
  try {
    const { email, password, role } = await req.json();
    if (!ROLES.includes(role)) {
      return NextResponse.json(
        { message: GENERIC },
        { status: 400, headers: NO_STORE },
      );
    }

    const account = normalizeEmail(email);
    const accountKey = `login-failure:acct:${account}`;
    const ip = clientIp(req.headers);
    const [ipAllowed, accountThrottle] = await Promise.all([
      ip
        ? rateLimit(`login:ip:${ip}`, {
            max: 20,
            windowMs: 15 * 60 * 1000,
          })
        : Promise.resolve(true),
      account
        ? checkLoginThrottle(accountKey)
        : Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
    ]);
    if (!ipAllowed || !accountThrottle.allowed) {
      return NextResponse.json(
        { message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau." },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "Retry-After": String(
              Math.max(1, accountThrottle.retryAfterSeconds),
            ),
          },
        },
      );
    }

    const deviceId = readOrCreateDeviceId(req);
    const result = await initiateLogin({
      email,
      password,
      expectedRole: role,
      deviceId,
    });

    if (result.step === "rejected") {
      const failure = account
        ? await recordLoginFailure(accountKey)
        : { blocked: false, retryAfterSeconds: 0 };
      if (result.userId) {
        afterResponse(() =>
          recordLoginActivity({
            userId: result.userId as string,
            success: false,
            ip: ip ?? "unknown",
            userAgent: req.headers.get("user-agent"),
            deviceIdHash: hashDeviceId(deviceId),
          }),
        );
      }
      return attachDeviceCookie(
        NextResponse.json(
          {
            message: failure.blocked
              ? "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau."
              : GENERIC,
          },
          {
            status: failure.blocked ? 429 : 401,
            headers: failure.blocked
              ? {
                  ...NO_STORE,
                  "Retry-After": String(failure.retryAfterSeconds),
                }
              : NO_STORE,
          },
        ),
        deviceId,
      );
    }

    if (account) await resetLoginFailures(accountKey);

    if (result.step === "limited") {
      return attachDeviceCookie(
        NextResponse.json(
          { message: "Bạn đã yêu cầu quá nhiều mã. Vui lòng thử lại sau." },
          { status: 429, headers: NO_STORE },
        ),
        deviceId,
      );
    }

    if (result.step === "otp") {
      // Send synchronously so a delivery failure never leaves the user waiting
      // for a code that was never emailed — drop the challenge and report 503.
      if (result.otp) {
        try {
          await sendLoginOtpEmail(result.email, result.otp);
        } catch (mailError) {
          console.error("[mail] login OTP failed", mailError);
          await invalidateLoginChallenge(result.challengeId);
          return attachDeviceCookie(
            NextResponse.json(
              { message: "Không gửi được mã xác thực. Vui lòng thử lại." },
              { status: 503, headers: NO_STORE },
            ),
            deviceId,
          );
        }
      }
      return attachDeviceCookie(
        NextResponse.json(
          { step: "otp", challengeId: result.challengeId },
          { status: 200, headers: NO_STORE },
        ),
        deviceId,
      );
    }

    return attachDeviceCookie(
      NextResponse.json(
        { step: "ready", loginGrant: result.loginGrant },
        { status: 200, headers: NO_STORE },
      ),
      deviceId,
    );
  } catch (error) {
    console.error("Login initiation failed", error);
    return NextResponse.json(
      { message: "Không thể đăng nhập lúc này. Vui lòng thử lại." },
      { status: 500, headers: NO_STORE },
    );
  }
}
