import type { ClientSession } from "mongoose";

import { cancelSupersededMails, enqueueMail } from "@/lib/mail/outbox";
import { accountActivationMessage } from "@/lib/mailer";
import { canonicalOrigin } from "@/lib/security/origins";
import { consumeRateLimit } from "@/lib/security/rateLimit";

/**
 * Phần dùng chung giữa `/api/auth/register` và `/api/auth/register/resend`.
 *
 * Hai route đó cùng phát ra một loại mail và cùng phải chịu một hạn mức. Tách ra đây để
 * chúng không thể lệch nhau: nếu mỗi route tự khai hạn mức riêng thì bấm luân phiên hai
 * endpoint sẽ né được cooldown, và mỗi lần sửa quy tắc lại phải nhớ sửa cả hai chỗ.
 */

/**
 * Liên kết kích hoạt sống 24 giờ — dài hơn 30 phút của đặt lại mật khẩu, vì người mới đăng
 * ký thường không mở hộp thư ngay, và hậu quả của một liên kết kích hoạt hết hạn nhẹ hơn
 * nhiều so với một liên kết đổi mật khẩu.
 */
export const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;

const SEND_COOLDOWN = { max: 1, windowMs: 60 * 1000 };
const SEND_HOURLY = { max: 5, windowMs: 60 * 60 * 1000 };
const IP_HOURLY = { max: 10, windowMs: 60 * 60 * 1000 };

export interface SendLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Tiêu thụ cả ba hạn mức cho một lần phát mail kích hoạt.
 *
 * Thứ tự kiểm là một phần của thiết kế, không phải sắp xếp tuỳ ý. Cooldown đứng trước và
 * chặn ngay, nên một người bấm dồn dập chỉ tiêu quota 60 giây của chính họ. Nếu hạn mức giờ
 * tiêu trước, năm lần bấm vội trong một phút đã đốt sạch quota năm mail mỗi giờ và người
 * dùng bị khoá cả tiếng dù chưa nhận được bức mail nào.
 *
 * Hạn mức theo tài khoản chạy KỂ CẢ khi không đọc được IP. `clientIp()` trả null khi
 * TRUST_PROXY chưa bật, và nếu bỏ luôn hạn mức tài khoản trong trường hợp đó thì một cấu
 * hình thiếu biến môi trường sẽ vô hiệu hoá toàn bộ chống lạm dụng mà không ai nhận ra.
 *
 * Hàm chạy trước mọi truy vấn nghiệp vụ và không biết email có tồn tại hay không: một địa
 * chỉ lạ phải tốn đúng số lượt như một địa chỉ đang chờ, nếu không chính hạn mức trở thành
 * kênh dò xem email nào đã đăng ký.
 */
export async function consumeActivationSendLimits(
  emailNormalized: string,
  ip: string | null,
): Promise<SendLimitResult> {
  const cooldown = await consumeRateLimit(
    `register:acct:cooldown:${emailNormalized}`,
    SEND_COOLDOWN,
  );
  if (!cooldown.allowed) {
    return { allowed: false, retryAfterSeconds: cooldown.retryAfterSeconds };
  }

  const hourly = await consumeRateLimit(
    `register:acct:hourly:${emailNormalized}`,
    SEND_HOURLY,
  );
  if (!hourly.allowed) {
    return { allowed: false, retryAfterSeconds: hourly.retryAfterSeconds };
  }

  if (ip) {
    const perIp = await consumeRateLimit(`register:ip:${ip}`, IP_HOURLY);
    if (!perIp.allowed) {
      return { allowed: false, retryAfterSeconds: perIp.retryAfterSeconds };
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Dựng liên kết kích hoạt. Token nằm ở URL fragment nên không bao giờ đi vào log máy chủ
 * hay header Referer, cùng lý do đã ghi ở luồng quên mật khẩu.
 *
 * NÉM lỗi khi production thiếu AUTH_URL thay vì nội suy `null` thành chuỗi: một liên kết
 * `null/activate#token=...` vẫn gửi đi được và trông bình thường trong hộp thư, nhưng
 * không ai bấm được — hỏng lặng lẽ, chỉ lộ ra khi có người thật không kích hoạt nổi.
 */
export function buildActivationLink(token: string, intent?: "vendor"): string {
  const base =
    canonicalOrigin() ??
    (process.env.NODE_ENV === "production" ? null : "http://localhost:3000");
  if (!base) {
    throw new Error(
      "AUTH_URL is required in production to build activation links.",
    );
  }
  const query = intent === "vendor" ? "?intent=vendor" : "";
  return `${base.replace(/\/$/, "")}/activate${query}#token=${token}`;
}

/**
 * Khoá gom mọi mail kích hoạt của một địa chỉ. Đặt ở đây vì ba nơi cùng dùng — xếp mail,
 * huỷ mail khi xoay token, và huỷ mail khi tài khoản đã tồn tại; gõ tay chuỗi này ở từng
 * nơi thì một lần gõ sai làm việc huỷ im lặng không khớp job nào.
 */
export function activationSupersessionKey(emailNormalized: string): string {
  return `register-activation:${emailNormalized}`;
}

/** Huỷ mọi mail kích hoạt còn `pending` của một địa chỉ, trong session của người gọi. */
export function cancelActivationMails(
  emailNormalized: string,
  options: { session: ClientSession },
): Promise<number> {
  return cancelSupersededMails(
    activationSupersessionKey(emailNormalized),
    options,
  );
}

/**
 * Huỷ mail kích hoạt cũ chưa gửi rồi xếp mail mới, trong cùng session của người gọi.
 *
 * Phải huỷ mail cũ vì token cũ vừa bị xoay: gửi cả hai thì người nhận thấy hai liên kết mà
 * chỉ một cái còn dùng được, và họ không có cách nào biết là cái nào.
 */
export async function enqueueActivationMail(params: {
  email: string;
  emailNormalized: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
  intent?: "vendor";
  session: ClientSession;
}) {
  const {
    email,
    emailNormalized,
    token,
    tokenHash,
    expiresAt,
    intent,
    session,
  } = params;

  await cancelActivationMails(emailNormalized, { session });

  return enqueueMail(
    {
      message: accountActivationMessage(
        email,
        buildActivationLink(token, intent),
      ),
      dedupeKey: `register-activation:${tokenHash}`,
      supersessionKey: activationSupersessionKey(emailNormalized),
      // Token hết hạn thì mail vô nghĩa; đừng gửi một liên kết đã chết.
      notAfter: expiresAt,
      // Liên kết chính là bearer token: đọc được outbox là tạo được tài khoản.
      scrubOnTerminal: true,
    },
    { session },
  );
}
