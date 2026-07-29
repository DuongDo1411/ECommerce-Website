// Hợp đồng chung của tầng gửi mail.
//
// Ba scope lỗi ở đây quyết định số phận một job trong outbox, nên đừng gộp chúng lại:
//
//   message   — hỏng ở CHÍNH bức mail này (địa chỉ sai, thiếu subject). Gửi lại bao nhiêu
//               lần cũng hỏng y hệt → chuyển dead ngay, đừng đốt quota.
//   provider  — hỏng ở CẤU HÌNH hoặc HẠN MỨC (API key sai, domain chưa verify, hết quota
//               ngày). Bức mail không có lỗi gì; retry sớm chỉ tổ hỏng thêm. Giữ pending,
//               hẹn lại xa, và KHÔNG tính vào giới hạn transient — nếu tính thì một sự cố
//               cấu hình kéo dài vài giờ sẽ giết sạch mọi job đang chờ.
//   transient — trục trặc nhất thời (mạng, 5xx, rate limit). Đây mới là loại đáng backoff.

export type MailProviderName = "resend" | "smtp" | "console";

export type MailErrorScope = "message" | "provider" | "transient";

export type MailPriority = "high" | "normal";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface MailSendResult {
  providerMessageId: string;
  headers?: Record<string, string>;
}

export interface MailSendOptions {
  /** Khoá chống gửi trùng phía provider. Luôn là _id của document outbox. */
  idempotencyKey?: string;
  signal: AbortSignal;
  /** OTP chặn response của người dùng nên phải vượt lên trước job nền. */
  priority: MailPriority;
}

export interface MailProvider {
  readonly name: MailProviderName;
  send(
    message: MailMessage,
    options: MailSendOptions,
  ): Promise<MailSendResult>;
}

export class MailSendError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly scope: MailErrorScope;
  /** Provider bảo chờ bao lâu (từ header rate limit), nếu có. */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    init: {
      code: string;
      scope: MailErrorScope;
      status?: number;
      retryAfterMs?: number;
    },
  ) {
    super(message);
    this.name = "MailSendError";
    this.code = init.code;
    this.scope = init.scope;
    this.status = init.status;
    this.retryAfterMs = init.retryAfterMs;
    // Chỉ "message" là hết đường; hai scope còn lại đều còn cửa gửi lại.
    this.retryable = init.scope !== "message";
  }
}

/** Lỗi không phải MailSendError (bug, lỗi lạ) mặc định coi là transient. */
export function asMailSendError(error: unknown): MailSendError {
  if (error instanceof MailSendError) return error;
  return new MailSendError(
    error instanceof Error ? error.message : String(error),
    { code: "unknown_error", scope: "transient" },
  );
}
