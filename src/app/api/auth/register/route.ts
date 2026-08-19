import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

import {
  ACTIVATION_TTL_MS,
  consumeActivationSendLimits,
  enqueueActivationMail,
} from "@/lib/auth/registrationActivation";
import connectDB from "@/lib/connectDB";
import { flushOne } from "@/lib/mail/outbox";
import { afterResponse } from "@/lib/security/afterResponse";
import { emailIdentityFilter, normalizeEmail } from "@/lib/security/email";
import { generateToken, hashToken } from "@/lib/security/otp";
import { BCRYPT_COST, validatePasswordPolicy } from "@/lib/security/password";
import { clientIp } from "@/lib/security/rateLimit";
import { readLimitedJsonBody } from "@/lib/security/requestBody";
import { noStoreJson } from "@/lib/security/response";
import PendingRegistration from "@/model/pendingRegistration.model";
import User from "@/model/user.model";

const MAX_BODY_BYTES = 4 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ném từ trong transaction khi email đã có tài khoản thật; ánh xạ ra 409. */
class AccountAlreadyExists extends Error {}

/**
 * Ném khi email đang có một bản ghi chờ CÒN HẠN của luồng khác — người mua đăng ký trong lúc
 * một lượt đăng ký nhà bán cho cùng địa chỉ chưa kích hoạt, hoặc ngược lại.
 *
 * Không im lặng ghi đè: hai luồng tạo ra hai loại tài khoản khác nhau, nên xoay token của
 * luồng kia vừa vô hiệu liên kết mà người đó đang cầm, vừa gửi cho họ một bức mail dẫn tới
 * loại tài khoản không phải thứ họ đăng ký.
 */
class RegistrationIntentConflict extends Error {}

/** Chuẩn hoá `intent` về loại tài khoản để so sánh; thiếu `intent` nghĩa là người mua. */
const roleOfIntent = (intent: unknown) =>
  intent === "vendor" ? "vendor" : "user";

const INTENT_CONFLICT =
  "Email này đang chờ kích hoạt cho một loại tài khoản khác. Hãy hoàn tất liên kết đã gửi, hoặc dùng email khác.";

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Trùng khoá ĐÚNG ở `emailNormalized`, không phải ở một index nào khác.
 *
 * Phân biệt việc này là bắt buộc. `tokenHash` cũng là khoá duy nhất, và outbox có khoá
 * `dedupeKey`; một va chạm ở đó là lỗi thật. Nếu gộp chung, ta sẽ trả lời "đã gửi liên kết
 * kích hoạt" cho một lượt đăng ký chưa ghi được gì và chưa có bức mail nào — người dùng ngồi
 * đợi vô ích, còn lỗi thật thì không ai thấy.
 */
function isEmailNormalizedDuplicate(error: unknown): boolean {
  if (!isDuplicateKey(error)) return false;
  const detail = error as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
  };
  return (
    detail.keyPattern?.emailNormalized !== undefined ||
    detail.keyValue?.emailNormalized !== undefined
  );
}

/**
 * Đăng ký trực tiếp bằng email và mật khẩu.
 *
 * Route này KHÔNG tạo tài khoản. Nó ghi một bản ghi chờ rồi gửi liên kết kích hoạt; `users`
 * chỉ nhận document mới ở `/api/auth/activate` sau khi chủ hộp thư bấm liên kết. Nhờ vậy mọi
 * hàng trong `users` đều là tài khoản đã xác minh email, và không cần thêm cờ trạng thái nào
 * lên user schema — tài khoản cũ tiếp tục đăng nhập bình thường, không phải backfill.
 *
 * Google OAuth không đi qua đây: Google đã chứng minh quyền sở hữu email nên tạo user ngay.
 */
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

    const record = (body ?? {}) as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const rawEmail =
      typeof record.email === "string" ? record.email.trim() : "";
    const password =
      typeof record.password === "string" ? record.password : "";
    // Chỉ chấp nhận đúng một giá trị; mọi intent khác bị bỏ qua chứ không báo lỗi, để một
    // tham số lạ trên URL không chặn được người dùng đăng ký.
    const intent = record.intent === "vendor" ? ("vendor" as const) : undefined;

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

    // Kiểm sớm để trả lỗi rõ ràng mà không tốn một lượt hạn mức; lần kiểm có thẩm quyền
    // nằm trong transaction bên dưới.
    const existingUser = await User.findOne(
      emailIdentityFilter(emailNormalized),
    ).select("_id");
    if (existingUser) {
      return noStoreJson({ message: "Email đã được sử dụng." }, { status: 409 });
    }

    const limit = await consumeActivationSendLimits(
      emailNormalized,
      clientIp(req.headers),
    );
    if (!limit.allowed) {
      return noStoreJson(
        { message: "Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, limit.retryAfterSeconds)),
          },
        },
      );
    }

    // Băm trước khi mở transaction. bcrypt tốn hàng trăm mili giây và giữ transaction mở
    // suốt thời gian đó là giữ khoá vô ích; đổi lại, khi bản ghi chờ còn hiệu lực thì hash
    // vừa tính bị bỏ đi — chấp nhận được vì đăng ký không phải đường nóng.
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const token = generateToken();
    const tokenHash = hashToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_TTL_MS);

    let outboxId: mongoose.Types.ObjectId;
    const dbSession = await mongoose.startSession();
    try {
      // ID của job mail đi ra bằng giá trị trả về của callback chứ không bằng biến gán từ
      // bên trong. MongoDB chạy lại callback khi gặp lỗi nhất thời, và ID sinh ra ở lượt đã
      // bị rollback trỏ tới một job không còn tồn tại — đẩy hàng đợi theo ID đó là gọi vào
      // hư vô, còn bức mail thật thì không ai đẩy.
      outboxId = await dbSession.withTransaction<mongoose.Types.ObjectId>(
        async () => {
          // Kiểm lại trong transaction: `/api/auth/activate` và Google OAuth đều tạo user, và
          // cả hai có thể xen vào giữa lần kiểm sớm ở trên với thời điểm này. Thiếu bước này
          // sẽ để lại một bản ghi chờ mồ côi cho một email đã có tài khoản.
          const claimed = await User.findOne(
            emailIdentityFilter(emailNormalized),
          )
            .select("_id")
            .session(dbSession);
          if (claimed) throw new AccountAlreadyExists();

          const existing = await PendingRegistration.findOne({ emailNormalized })
            .select("+passwordHash")
            .session(dbSession);

          let effectiveEmail = rawEmail;
          let effectiveIntent = intent;

          if (existing) {
            if (existing.expiresAt.getTime() > now.getTime()) {
              // Bản ghi chờ còn sống của LUỒNG KHÁC: dừng lại, không chạm gì. Người mua và
              // nhà bán tạo ra hai loại tài khoản khác nhau, nên xoay token ở đây sẽ giết
              // liên kết mà người kia đang cầm.
              if (roleOfIntent(existing.intent) !== roleOfIntent(intent)) {
                throw new RegistrationIntentConflict();
              }

              // Cùng luồng: chỉ xoay token. Không cho một lượt đăng ký thứ hai ghi đè tên và
              // mật khẩu của lượt đầu — nếu cho, ai biết địa chỉ email của người khác cũng
              // đặt được mật khẩu cho tài khoản sắp được tạo.
              effectiveEmail = existing.email;
              effectiveIntent = existing.intent;
            } else {
              existing.name = name;
              existing.email = rawEmail;
              existing.passwordHash = passwordHash;
              existing.intent = intent;
            }
            existing.tokenHash = tokenHash;
            existing.expiresAt = expiresAt;
            await existing.save({ session: dbSession });
          } else {
            await PendingRegistration.create(
              [
                {
                  name,
                  email: rawEmail,
                  emailNormalized,
                  passwordHash,
                  tokenHash,
                  expiresAt,
                  intent,
                },
              ],
              { session: dbSession },
            );
          }

          return enqueueActivationMail({
            email: effectiveEmail,
            emailNormalized,
            token,
            tokenHash,
            expiresAt,
            intent: effectiveIntent,
            session: dbSession,
          });
        },
      );
    } catch (txError) {
      if (txError instanceof AccountAlreadyExists) {
        return noStoreJson(
          { message: "Email đã được sử dụng." },
          { status: 409 },
        );
      }
      if (txError instanceof RegistrationIntentConflict) {
        return noStoreJson(
          { code: "registration_intent_conflict", message: INTENT_CONFLICT },
          { status: 409 },
        );
      }
      // Hai lượt đăng ký cùng email chạy song song: unique index cho đúng một bên thắng.
      // Bên thua không ghi đè bản ghi của bên thắng và cũng không gửi thêm mail.
      //
      // Nhưng phải đọc xem bên thắng thuộc luồng nào. Cùng luồng thì liên kết của họ đã trên
      // đường tới đúng hộp thư đó, nên trả 202 là đúng sự thật. Khác luồng thì không: người
      // này đăng ký nhà bán mà bức mail đang bay tới lại là mail người mua, và nói "đã gửi
      // liên kết" sẽ khiến họ bấm vào rồi nhận một loại tài khoản khác.
      if (isEmailNormalizedDuplicate(txError)) {
        // Session đã abort nên truy vấn này phải chạy ngoài transaction.
        const winner = await PendingRegistration.findOne({ emailNormalized })
          .select("intent expiresAt")
          .lean<{ intent?: "vendor"; expiresAt: Date } | null>();

        // Không tìm được bên thắng, hoặc bản ghi của nó đã hết hạn: không có liên kết nào
        // đang trên đường tới hộp thư đó. Ném lại để thành 500 — nói "đã gửi" lúc này là nói
        // dối, và người dùng sẽ đợi một bức mail không tồn tại.
        if (!winner || winner.expiresAt.getTime() <= now.getTime()) {
          throw txError;
        }

        if (roleOfIntent(winner.intent) !== roleOfIntent(intent)) {
          return noStoreJson(
            { code: "registration_intent_conflict", message: INTENT_CONFLICT },
            { status: 409 },
          );
        }

        console.warn("[register] đăng ký đồng thời, giữ bản ghi thắng");
        return noStoreJson(
          { message: "Đã gửi liên kết kích hoạt tới email của bạn." },
          { status: 202 },
        );
      }
      throw txError;
    } finally {
      await dbSession.endSession();
    }

    // Chỉ đẩy hàng đợi SAU khi transaction commit. Gọi trong transaction thì một lần
    // rollback sẽ để lại mail đã gửi cho một bản ghi chờ không tồn tại. Tới được đây nghĩa là
    // commit đã xong và `outboxId` là ID của job vừa commit, không phải của lượt rollback.
    const jobId = outboxId;
    afterResponse(async () => {
      await flushOne(jobId);
    });

    return noStoreJson(
      { message: "Đã gửi liên kết kích hoạt tới email của bạn." },
      { status: 202 },
    );
  } catch (error) {
    console.error("register error", error);
    return noStoreJson(
      { message: "Không thể đăng ký lúc này." },
      { status: 500 },
    );
  }
}
