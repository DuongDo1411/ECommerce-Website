// Provider SMTP (Gmail) — đường rollback có chủ đích, KHÔNG phải failover tự động.
//
// Chỉ chạy khi ai đó đặt rõ MAIL_PROVIDER=smtp. Không có chuyện Resend hỏng thì tự tụt về
// đây: hai provider gửi từ hai địa chỉ khác nhau, tự ý đổi giữa chừng là người nhận thấy
// mail của sàn lúc thì no-reply@domain lúc thì một địa chỉ Gmail lạ.
//
// Transporter tạo LAZY. Bản cũ tạo ngay lúc import module, nên mọi file chạm tới mailer —
// kể cả test — đều dựng một transporter không bao giờ dùng tới.
//
// GIỚI HẠN so với Resend: (1) Gmail bắt buộc From trùng tài khoản đã xác thực nên MAIL_FROM
// bị bỏ qua, chỉ đổi được tên hiển thị; (2) không có idempotency key, nên nếu lease hết hạn
// giữa chừng và job được gửi lại thì người nhận có thể nhận hai bức. Outbox chỉ chặn được
// bằng CAS, không có lớp phòng thủ thứ hai như khi dùng Resend.

import nodemailer, { type Transporter } from "nodemailer";

import {
  MailSendError,
  type MailMessage,
  type MailProvider,
  type MailSendResult,
} from "../types";

let transporter: Transporter | null = null;

function getTransporter(user: string, pass: string): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return transporter;
}

/** Chỉ dùng cho test: bỏ transporter đang cache để lần sau dựng lại. */
export function resetSmtpTransporter() {
  transporter = null;
}

function toMailSendError(error: unknown): MailSendError {
  const code = String((error as { code?: unknown })?.code ?? "smtp_error");
  const responseCode = Number(
    (error as { responseCode?: unknown })?.responseCode,
  );
  const message =
    error instanceof Error ? error.message : String(error ?? "SMTP thất bại");
  const status = Number.isFinite(responseCode) ? responseCode : undefined;

  // SMTP 5xx là từ chối vĩnh viễn (hộp thư không tồn tại, bị chặn) — gửi lại vô ích.
  // 4xx là từ chối tạm thời, đúng nghĩa transient.
  if (status !== undefined && status >= 500 && status < 600) {
    return new MailSendError(`SMTP ${status}: ${message}`, {
      code,
      scope: "message",
      status,
    });
  }

  // Sai tài khoản/app password: cấu hình hỏng, không phải mail hỏng.
  if (code === "EAUTH") {
    return new MailSendError(`SMTP xác thực thất bại: ${message}`, {
      code,
      scope: "provider",
      status,
      retryAfterMs: 60 * 60_000,
    });
  }

  return new MailSendError(`SMTP: ${message}`, {
    code,
    scope: "transient",
    status,
  });
}

export function createSmtpProvider(user: string, pass: string): MailProvider {
  return {
    name: "smtp",
    // Nodemailer không nhận AbortSignal và Gmail không có idempotency key, nên provider
    // này bỏ qua options — giới hạn đã nêu ở đầu file.
    async send(message: MailMessage): Promise<MailSendResult> {
      try {
        const displayName = (message.fromName ?? "MultiCart").replace(
          /["<>\\]/g,
          "",
        );
        const info = await getTransporter(user, pass).sendMail({
          // Gmail ghi đè From về tài khoản đã xác thực, nên đừng dùng MAIL_FROM ở đây.
          from: `"${displayName}" <${user}>`,
          to: message.to,
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
        });
        return { providerMessageId: String(info.messageId ?? "") };
      } catch (error) {
        throw toMailSendError(error);
      }
    },
  };
}
