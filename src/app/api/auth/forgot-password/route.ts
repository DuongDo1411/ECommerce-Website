import connectDB from "@/lib/connectDB";
import {
  cancelSupersededMails,
  enqueueMail,
  flushOne,
} from "@/lib/mail/outbox";
import { passwordResetMessage } from "@/lib/mailer";
import { afterResponse } from "@/lib/security/afterResponse";
import { emailIdentityFilter, normalizeEmail } from "@/lib/security/email";
import { generateToken, hashToken } from "@/lib/security/otp";
import { canonicalOrigin } from "@/lib/security/origins";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { noStoreJson } from "@/lib/security/response";
import PasswordResetToken from "@/model/passwordResetToken.model";
import User from "@/model/user.model";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { apiErrorMessage } from "@/lib/apiError";

const TTL_MS = 30 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// Always responds with a generic 202 so it never reveals whether an account
// exists. Only password accounts (not Google-only) get a reset link.
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email } = await req.json();
    const cleanEmail = String(email ?? "").trim();
    const emailNormalized = normalizeEmail(cleanEmail);

    const generic = noStoreJson(
      {
        message:
          "Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu.",
      },
      { status: 202 },
    );
    if (!cleanEmail) return generic;

    const ip = clientIp(req.headers);
    const ipOk = ip
      ? await rateLimit(`forgot:ip:${ip}`, {
          max: 5,
          windowMs: HOUR,
        })
      : true;
    const acctOk = await rateLimit(`forgot:acct:${emailNormalized}`, {
      max: 3,
      windowMs: HOUR,
    });
    if (!ipOk || !acctOk) {
      return noStoreJson(
        { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
        { status: 429 },
      );
    }

    const token = generateToken();
    const user = await User.findOne(
      emailIdentityFilter(emailNormalized),
    ).select("+password");
    if (!user || typeof user.password !== "string") return generic;

    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TTL_MS);
    const base = canonicalOrigin() ?? "http://localhost:3000";
    // Token lives in the URL fragment so it never hits server logs / Referer.
    const resetLink = `${base.replace(/\/$/, "")}/reset-password#token=${token}`;
    const supersessionKey = `password-reset:${emailNormalized}`;

    // Token và mail phải cùng sống hoặc cùng chết. Ghi token xong mà mail hỏng thì người
    // dùng ngồi chờ một liên kết không bao giờ tới; ghi mail xong mà token hỏng thì liên
    // kết gửi đi lại vô dụng. Một transaction loại cả hai khả năng.
    const dbSession = await mongoose.startSession();
    let outboxId: mongoose.Types.ObjectId | null = null;
    try {
      outboxId = await dbSession.withTransaction(async () => {
        // Yêu cầu mới vừa làm token cũ mất hiệu lực, nên liên kết cũ chưa kịp gửi cũng
        // không còn ý nghĩa. Gửi nó đi chỉ tổ làm người nhận bối rối giữa hai email.
        await cancelSupersededMails(supersessionKey, { session: dbSession });

        // One live token per account, even when two forgot requests race.
        await PasswordResetToken.findOneAndUpdate(
          { emailNormalized },
          {
            $set: { email: user.email, tokenHash, expiresAt },
            $unset: { usedAt: "" },
          },
          { upsert: true, session: dbSession },
        );

        return enqueueMail(
          {
            message: passwordResetMessage(user.email, resetLink),
            dedupeKey: `password-reset:${tokenHash}`,
            supersessionKey,
            // Hết hạn token thì mail vô nghĩa. Đừng gửi một liên kết đã chết.
            notAfter: expiresAt,
            // Liên kết chính là bearer token: đọc được outbox là đổi được mật khẩu.
            scrubOnTerminal: true,
          },
          { session: dbSession },
        );
      });
    } catch (mailError) {
      // Transaction đã rollback: không có token mới, không có mail. Vẫn trả generic 202 —
      // đổi thông điệp ở đây là biến lỗi hạ tầng thành kênh dò tài khoản tồn tại.
      console.error("[forgot-password] ghi token + mail thất bại", mailError);
      return generic;
    } finally {
      await dbSession.endSession();
    }

    // TRẢ VỀ promise chứ không `void` nó: afterResponse chỉ bắt được lỗi của task nếu task
    // đưa promise ra. Nuốt ở đây thì một lần gửi hỏng thành unhandled rejection.
    const jobId = outboxId;
    if (jobId) {
      afterResponse(async () => {
        await flushOne(jobId);
      });
    }
    return generic;
  } catch (error) {
    return noStoreJson(
      { message: apiErrorMessage("forgot password error", error) },
      { status: 500 },
    );
  }
}
