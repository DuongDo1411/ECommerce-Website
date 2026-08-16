// Façade gửi mail.
//
// Giữ nguyên tên file và tên export cũ để 7 call site hiện hữu không phải đổi gì. Phần
// thay đổi nằm dưới lớp này: provider chọn theo MAIL_PROVIDER, có hạn mức tốc độ, có
// phân loại lỗi.
//
// sendMail() gửi NGAY và NÉM lỗi. Đó là hợp đồng mà đường OTP dựa vào: login/initiate và
// 2fa/initiate bắt lỗi này để huỷ challenge rồi trả 503. Nếu đổi thành "ghi outbox rồi
// gửi sau", người dùng sẽ nhận màn hình nhập OTP cho một mã chưa chắc bao giờ được gửi —
// và challenge thì đã tạo rồi. Đừng đưa OTP vào outbox.
//
// Mail nghiệp vụ (reset mật khẩu, hoàn/trả) đi đường khác: enqueueMail() trong
// lib/mail/outbox.ts, ghi cùng transaction với dữ liệu nghiệp vụ.

import { getMailProvider } from "./mail/provider";
import { withMailRate } from "./mail/rateGate";
import type { MailMessage, MailPriority, MailSendResult } from "./mail/types";

export type { MailMessage, MailSendResult } from "./mail/types";
export { MailSendError } from "./mail/types";

/** Signal không bao giờ abort — deadline thật do provider tự áp (MAIL_TIMEOUT_MS). */
const NEVER_ABORT = new AbortController().signal;

/**
 * Gửi ngay lập tức, ném lỗi nếu thất bại.
 *
 * Priority mặc định "high": đường duy nhất còn gọi thẳng hàm này là OTP, thứ đang chặn
 * response của người dùng. Worker outbox không đi qua đây — nó gọi provider trực tiếp với
 * priority "normal" để không tranh chỗ với OTP.
 */
export async function sendMail(
  message: MailMessage,
  options?: { idempotencyKey?: string; priority?: MailPriority },
): Promise<MailSendResult> {
  const priority: MailPriority = options?.priority ?? "high";
  return withMailRate(priority, () =>
    getMailProvider().send(message, {
      idempotencyKey: options?.idempotencyKey,
      signal: NEVER_ABORT,
      priority,
    }),
  );
}

/**
 * Trong môi trường dev, in OTP ra console để có thể test với email bịa/không có
 * hộp thư thật. Không bao giờ log ở production.
 */
function logOtpInDev(kind: string, email: string, otp: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV OTP] ${kind} → ${email}: ${otp}`);
  }
}

function otpEmailHtml(title: string, intro: string, otp: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px">
      <h2 style="color:#111">${title}</h2>
      <p style="color:#333">${intro}</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0;color:#2563eb">${otp}</div>
      <p style="color:#666;font-size:13px">Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
    </div>
  `;
}

/** OTP đăng nhập (2FA) cho tài khoản User/Vendor có bật xác minh 2 bước. */
export async function sendLoginOtpEmail(email: string, otp: string) {
  logOtpInDev("login", email, otp);
  await sendMail({
    to: email,
    subject: "Mã đăng nhập MultiCart",
    html: otpEmailHtml(
      "Xác minh đăng nhập",
      "Nhập mã dưới đây để hoàn tất đăng nhập:",
      otp,
    ),
  });
}

/** OTP xác nhận bật/tắt xác minh 2 bước trong trang hồ sơ. */
export async function sendTwoFactorOtpEmail(
  email: string,
  otp: string,
  action: "enable" | "disable",
) {
  logOtpInDev(`2fa-${action}`, email, otp);
  await sendMail({
    to: email,
    subject:
      action === "enable"
        ? "Bật xác minh 2 bước — MultiCart"
        : "Tắt xác minh 2 bước — MultiCart",
    html: otpEmailHtml(
      action === "enable"
        ? "Xác nhận bật xác minh 2 bước"
        : "Xác nhận tắt xác minh 2 bước",
      "Nhập mã dưới đây để xác nhận thay đổi cài đặt bảo mật:",
      otp,
    ),
  });
}

/**
 * Nội dung mail đặt lại mật khẩu. Tách riêng khỏi hàm gửi để outbox render được payload
 * mà không phải gửi ngay — bước 4 sẽ ghi payload này vào outbox trong cùng transaction
 * với PasswordResetToken.
 */
export function passwordResetMessage(
  email: string,
  resetUrl: string,
): MailMessage {
  return {
    to: email,
    subject: "Đặt lại mật khẩu — MultiCart",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px">
        <h2 style="color:#111">Đặt lại mật khẩu</h2>
        <p style="color:#333">Nhấn nút dưới đây để đặt lại mật khẩu (hiệu lực 30 phút):</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Đặt lại mật khẩu</a></p>
        <p style="color:#666;font-size:13px">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      </div>
    `,
  };
}

/** Liên kết đặt lại mật khẩu (fragment token) cho luồng quên mật khẩu. */
export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  await sendMail(passwordResetMessage(email, resetUrl));
}

/**
 * Nội dung mail kích hoạt tài khoản cho luồng đăng ký trực tiếp bằng email/mật khẩu.
 * Cùng lý do tách khỏi hàm gửi như passwordResetMessage: route đăng ký ghi payload này vào
 * outbox trong cùng transaction với bản ghi PendingRegistration.
 *
 * Câu cuối không phải khách sáo. Bất kỳ ai cũng gõ được email của người khác vào form đăng
 * ký, nên người nhận có thể chưa từng đăng ký; họ cần biết rằng bỏ qua là đủ, và bỏ qua thì
 * không có tài khoản nào được tạo bằng địa chỉ của họ.
 */
export function accountActivationMessage(
  email: string,
  activationUrl: string,
): MailMessage {
  return {
    to: email,
    subject: "Kích hoạt tài khoản — MultiCart",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px">
        <h2 style="color:#111">Kích hoạt tài khoản</h2>
        <p style="color:#333">Nhấn nút dưới đây để hoàn tất đăng ký (hiệu lực 24 giờ):</p>
        <p><a href="${activationUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Kích hoạt tài khoản</a></p>
        <p style="color:#666;font-size:13px">Nếu bạn không đăng ký tài khoản MultiCart, hãy bỏ qua email này — sẽ không có tài khoản nào được tạo.</p>
      </div>
    `,
  };
}
