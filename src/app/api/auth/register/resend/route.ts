import mongoose from "mongoose";
import { NextRequest } from "next/server";

import {
  ACTIVATION_TTL_MS,
  cancelActivationMails,
  consumeActivationSendLimits,
  enqueueActivationMail,
} from "@/lib/auth/registrationActivation";
import connectDB from "@/lib/connectDB";
import { flushOne } from "@/lib/mail/outbox";
import { afterResponse } from "@/lib/security/afterResponse";
import { emailIdentityFilter, normalizeEmail } from "@/lib/security/email";
import { generateToken, hashToken } from "@/lib/security/otp";
import { clientIp } from "@/lib/security/rateLimit";
import { readLimitedJsonBody } from "@/lib/security/requestBody";
import { noStoreJson } from "@/lib/security/response";
import PendingRegistration from "@/model/pendingRegistration.model";
import User from "@/model/user.model";

const MAX_BODY_BYTES = 2 * 1024;

// Một thông điệp duy nhất cho mọi trạng thái: email chưa từng đăng ký, đã kích hoạt xong,
// bản ghi chờ đã hết hạn, hay vừa được gửi lại thật. Phân biệt chúng sẽ biến endpoint này
// thành kênh dò xem địa chỉ nào đã có tài khoản — cùng lý do luồng quên mật khẩu luôn trả về
// một câu chung.
const GENERIC = "Nếu email đang chờ kích hoạt, chúng tôi đã gửi lại liên kết.";

/** Gửi lại liên kết kích hoạt cho một lượt đăng ký đang chờ. */
export async function POST(req: NextRequest) {
  try {
    await connectDB();

    let body: unknown;
    try {
      body = await readLimitedJsonBody(req, MAX_BODY_BYTES);
    } catch (parseError) {
      if (parseError instanceof RangeError) {
        return noStoreJson({ message: "Dữ liệu quá lớn." }, { status: 413 });
      }
      return noStoreJson({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
    }

    const rawEmail = (body as { email?: unknown } | null)?.email;
    const emailNormalized =
      typeof rawEmail === "string" ? normalizeEmail(rawEmail) : "";
    if (!emailNormalized) {
      return noStoreJson({ message: GENERIC }, { status: 202 });
    }

    const limit = await consumeActivationSendLimits(
      emailNormalized,
      clientIp(req.headers),
    );
    if (!limit.allowed) {
      return noStoreJson(
        { message: "Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, limit.retryAfterSeconds)),
          },
        },
      );
    }

    const token = generateToken();
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_TTL_MS);

    let outboxId: mongoose.Types.ObjectId | null = null;
    const dbSession = await mongoose.startSession();
    try {
      // ID của job mail đi ra bằng giá trị trả về của callback chứ không bằng biến gán từ
      // bên trong. MongoDB chạy lại callback khi gặp lỗi nhất thời; nếu lượt đầu xếp được
      // mail rồi rollback còn lượt sau không khớp bản ghi nào, một biến ngoài vẫn giữ ID cũ
      // và ta đi đẩy một job đã biến mất cùng transaction đó.
      outboxId = await dbSession.withTransaction<mongoose.Types.ObjectId | null>(
        async () => {
          // Tài khoản đã tồn tại thì không còn gì để kích hoạt. Xảy ra thật khi người dùng
          // đăng ký bằng mật khẩu rồi quay sang đăng nhập Google trước lúc bấm liên kết:
          // Google tạo tài khoản ngay, còn bản ghi chờ nằm lại tới khi TTL dọn sau 24 giờ.
          // Gửi thêm một liên kết kích hoạt lúc này là gửi thứ đã hết tác dụng.
          const owner = await User.findOne(emailIdentityFilter(emailNormalized))
            .select("_id")
            .session(dbSession);

          if (owner) {
            await PendingRegistration.deleteOne(
              { emailNormalized },
              { session: dbSession },
            );
            // Huỷ cả những liên kết đã xếp mà chưa kịp gửi: chúng cũng đã hết tác dụng.
            await cancelActivationMails(emailNormalized, { session: dbSession });
            return null;
          }

          // `expiresAt: { $gt: now }` nằm trong filter nên một bản ghi chờ đã hết hạn không
          // được hồi sinh: người dùng phải đăng ký lại để đặt lại tên và mật khẩu, thay vì
          // nhận liên kết mới cho thông tin cũ mà họ có thể đã quên.
          //
          // Chỉ ghi `tokenHash` và `expiresAt`. Không chạm `name`, `email`, `passwordHash`
          // hay `intent`: gửi lại là xin liên kết mới, không phải cơ hội đổi thông tin đăng ký.
          const updated = await PendingRegistration.findOneAndUpdate(
            { emailNormalized, expiresAt: { $gt: now } },
            { $set: { tokenHash, expiresAt } },
            { returnDocument: "after", session: dbSession },
          );

          // Không khớp bản ghi nào thì không xếp mail. Thiếu bước kiểm này sẽ gửi một liên
          // kết trỏ tới token chưa từng được lưu ở đâu cả.
          if (!updated) return null;

          return enqueueActivationMail({
            email: updated.email,
            emailNormalized,
            token,
            tokenHash,
            expiresAt,
            intent: updated.intent,
            session: dbSession,
          });
        },
      );
    } catch (txError) {
      // Rollback rồi: không có token mới, không có mail. Vẫn trả về thông điệp chung — đổi
      // câu trả lời ở đây là biến một lỗi hạ tầng thành kênh dò tài khoản.
      console.error("[register/resend] ghi token + mail thất bại", txError);
      return noStoreJson({ message: GENERIC }, { status: 202 });
    } finally {
      await dbSession.endSession();
    }

    const jobId = outboxId;
    if (jobId) {
      afterResponse(async () => {
        await flushOne(jobId);
      });
    }

    return noStoreJson({ message: GENERIC }, { status: 202 });
  } catch (error) {
    console.error("register resend error", error);
    return noStoreJson({ message: GENERIC }, { status: 202 });
  }
}
