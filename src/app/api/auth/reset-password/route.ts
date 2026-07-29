import { apiErrorMessage } from "@/lib/apiError";
import connectDB from "@/lib/connectDB";
import { enqueueMail, flushOne } from "@/lib/mail/outbox";
import { afterResponse } from "@/lib/security/afterResponse";
import { emailIdentityFilter } from "@/lib/security/email";
import { hashToken } from "@/lib/security/otp";
import { BCRYPT_COST, validatePasswordPolicy } from "@/lib/security/password";
import { clientIp, rateLimit } from "@/lib/security/rateLimit";
import { noStoreJson } from "@/lib/security/response";
import {
  disconnectUserSockets,
  revokeAccountSecurity,
} from "@/lib/security/session";
import PasswordResetToken from "@/model/passwordResetToken.model";
import User from "@/model/user.model";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

const invalidToken = () =>
  noStoreJson(
    { message: "Liên kết không hợp lệ hoặc đã hết hạn." },
    { status: 400 },
  );

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { token, newPassword } = await req.json();
    const rawToken = String(token ?? "").trim();
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) return invalidToken();

    const now = new Date();
    const tokenHash = hashToken(rawToken);
    const ip = clientIp(req.headers);
    if (
      ip &&
      !(await rateLimit(`reset-password:ip:${ip}`, {
        max: 20,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return noStoreJson(
        { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
        { status: 429 },
      );
    }

    // Reject random/expired links using the indexed digest before the HIBP
    // network lookup and bcrypt cost. The transaction below still performs the
    // authoritative single-use claim after those expensive checks.
    const liveToken = await PasswordResetToken.findOne({
      tokenHash,
      expiresAt: { $gt: now },
      $or: [{ usedAt: { $exists: false } }, { usedAt: null }],
    }).select("_id");
    if (!liveToken) return invalidToken();
    if (
      !(await rateLimit(`reset-password:token:${tokenHash}`, {
        max: 10,
        windowMs: 60 * 60 * 1000,
      }))
    ) {
      return noStoreJson(
        { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
        { status: 429 },
      );
    }

    const password = String(newPassword ?? "");
    const policy = await validatePasswordPolicy(password);
    if (!policy.ok) {
      return noStoreJson({ message: policy.reason }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const dbSession = await mongoose.startSession();
    let changedUser: {
      id: string;
      email: string;
      outboxId: mongoose.Types.ObjectId;
    } | null = null;
    try {
      changedUser = await dbSession.withTransaction(async () => {
        const claimTime = new Date();
        const record = await PasswordResetToken.findOneAndUpdate(
          {
            tokenHash,
            expiresAt: { $gt: claimTime },
            $or: [{ usedAt: { $exists: false } }, { usedAt: null }],
          },
          { $set: { usedAt: claimTime } },
          { returnDocument: "after", session: dbSession },
        );
        if (!record) return null;

        const user = await User.findOne(
          emailIdentityFilter(record.emailNormalized),
        )
          .select("email")
          .session(dbSession);
        if (!user?.email) throw new Error("Reset-token account no longer exists");

        await User.updateOne(
          { _id: user._id },
          { $set: { password: passwordHash } },
          { session: dbSession },
        );
        await revokeAccountSecurity(user._id.toString(), {
          session: dbSession,
        });

        // Thông báo bảo mật đi CÙNG transaction với việc đổi mật khẩu. Nếu tách ra ngoài
        // thì mật khẩu đổi xong mà mail bốc hơi — chủ tài khoản không hay biết gì, đúng
        // kịch bản nguy hiểm nhất của một vụ chiếm tài khoản.
        const outboxId = await enqueueMail(
          {
            message: {
              to: user.email,
              subject: "Mật khẩu Ecoshop đã được thay đổi",
              html: "<p>Mật khẩu tài khoản Ecoshop của bạn vừa được đặt lại. Nếu không phải bạn, hãy liên hệ quản trị viên ngay.</p>",
            },
            dedupeKey: `password-changed:${record._id}`,
          },
          { session: dbSession },
        );

        return { id: user._id.toString(), email: user.email, outboxId };
      });
    } finally {
      await dbSession.endSession();
    }

    if (!changedUser) return invalidToken();
    const changed = changedUser as {
      id: string;
      email: string;
      outboxId: mongoose.Types.ObjectId;
    };
    disconnectUserSockets(changed.id);
    // Mail đã nằm an toàn trong outbox rồi; lần kick này chỉ để giảm độ trễ. Gửi hỏng cũng
    // không sao — cron sẽ thử lại, và việc đặt lại mật khẩu thì đã commit xong.
    afterResponse(async () => {
      await flushOne(changed.outboxId);
    });

    return noStoreJson(
      { message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập." },
      { status: 200 },
    );
  } catch (error) {
    return noStoreJson(
      { message: apiErrorMessage("reset password error", error) },
      { status: 500 },
    );
  }
}
