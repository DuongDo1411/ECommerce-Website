// Provider Resend (official SDK).
//
// SDK KHÔNG ném lỗi cho request hỏng: emails.send() luôn trả { data, error, headers }, kể
// cả khi đứt mạng hay bị abort (lúc đó error.name = "application_error", statusCode = null).
// Nên chỗ phân loại lỗi ở dưới đọc result.error, không phải try/catch.
//
// SDK cũng KHÔNG tự retry — đúng cái ta cần. Retry là việc của outbox; hai tầng cùng retry
// thì attempts đếm sai và hạn mức tốc độ bị phá.
//
// Phân loại phải dựa vào error.name của Resend, KHÔNG chỉ HTTP status: 429 vừa có thể là
// "gọi quá nhanh" (chờ vài giây là xong) vừa có thể là "hết quota tháng" (chờ vài giờ).
// Cùng một status, hai số phận hoàn toàn khác nhau.

import { Resend } from "resend";

import {
  MailSendError,
  type MailMessage,
  type MailProvider,
  type MailSendOptions,
  type MailSendResult,
} from "../types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DEFAULT_TIMEOUT_MS = 10_000;

/** Hỏng ở chính bức mail — gửi lại y hệt vẫn hỏng y hệt. */
const TERMINAL_CODES = new Set([
  "validation_error",
  "invalid_from_address",
  "invalid_attachment",
  "invalid_parameter",
  "invalid_region",
  "missing_required_field",
  "invalid_idempotent_request",
  "invalid_idempotency_key",
  "not_found",
  "method_not_allowed",
]);

/** Hỏng ở cấu hình hoặc hạn mức — bức mail vô tội, chỉ cần chờ đúng lúc. */
const PROVIDER_RETRY_MS: Record<string, number> = {
  missing_api_key: HOUR_MS,
  invalid_api_key: HOUR_MS,
  restricted_api_key: HOUR_MS,
  invalid_access: 15 * MINUTE_MS,
  security_error: 15 * MINUTE_MS,
  // Hết quota ngày: chờ qua ngày mới. Retry sớm chỉ tổ ăn thêm 429.
  daily_quota_exceeded: 24 * HOUR_MS,
  // Hết quota tháng: 6 giờ là đủ thưa để không spam, đủ dày để bắt được lúc nâng gói.
  monthly_quota_exceeded: 6 * HOUR_MS,
};

const TRANSIENT_CODES = new Set([
  "rate_limit_exceeded",
  "concurrent_idempotent_requests",
  "internal_server_error",
  // Gồm cả đứt mạng và timeout: SDK gói mọi lỗi fetch vào mã này với statusCode = null.
  "application_error",
]);

function timeoutMs(): number {
  const raw = Number(process.env.MAIL_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/** Đọc "provider bảo chờ bao lâu" từ header rate limit, nếu có. */
function parseRetryAfterMs(
  headers: Record<string, string> | null | undefined,
): number | undefined {
  if (!headers) return undefined;
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value;
  }
  for (const key of ["retry-after", "ratelimit-reset", "x-ratelimit-reset"]) {
    const seconds = Number(lower[key]);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return undefined;
}

/**
 * `MAIL_FROM` giữ địa chỉ (phải thuộc domain đã verify), `fromName` chỉ đổi tên hiển thị.
 * Không cho fromName chứa dấu nháy hay ngoặc nhọn — một cái nháy lạc chỗ là hỏng cả header
 * From và Resend từ chối nguyên bức mail.
 */
export function applyDisplayName(from: string, fromName?: string): string {
  if (!fromName?.trim()) return from;
  const match = from.match(/<([^>]+)>/);
  const address = (match?.[1] ?? from).trim();
  const safeName = fromName.replace(/["<>\\]/g, "").trim();
  return safeName ? `"${safeName}" <${address}>` : from;
}

export function toMailSendError(
  error: { name?: string; message?: string; statusCode?: number | null },
  headers: Record<string, string> | null,
): MailSendError {
  const code = error.name ?? "application_error";
  const status = error.statusCode ?? undefined;
  const message = `Resend ${code}${status ? ` (${status})` : ""}: ${
    error.message ?? "không rõ nguyên nhân"
  }`;

  if (TERMINAL_CODES.has(code)) {
    return new MailSendError(message, { code, scope: "message", status });
  }

  const providerRetryMs = PROVIDER_RETRY_MS[code];
  if (providerRetryMs !== undefined) {
    return new MailSendError(message, {
      code,
      scope: "provider",
      status,
      retryAfterMs: providerRetryMs,
    });
  }

  if (TRANSIENT_CODES.has(code)) {
    return new MailSendError(message, {
      code,
      scope: "transient",
      status,
      retryAfterMs: parseRetryAfterMs(headers),
    });
  }

  // Mã lạ (SDK thêm code mới): quay về suy từ HTTP status. 401/403/451 vẫn là chuyện cấu
  // hình; 4xx còn lại coi như hỏng hẳn để không retry vô ích.
  if (status === 401 || status === 403 || status === 451) {
    return new MailSendError(message, {
      code,
      scope: "provider",
      status,
      retryAfterMs: 15 * MINUTE_MS,
    });
  }
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return new MailSendError(message, { code, scope: "message", status });
  }
  return new MailSendError(message, {
    code,
    scope: "transient",
    status,
    retryAfterMs: parseRetryAfterMs(headers),
  });
}

export function createResendProvider(
  apiKey: string,
  from: string,
): MailProvider {
  const client = new Resend(apiKey);

  return {
    name: "resend",
    async send(
      message: MailMessage,
      options: MailSendOptions,
    ): Promise<MailSendResult> {
      // SDK không khai báo `signal` trong PostOptions, nhưng post() spread nguyên options
      // vào fetch init nên signal vẫn tới nơi. Ép kiểu gọn ở đúng một chỗ này.
      const requestOptions = {
        idempotencyKey: options.idempotencyKey,
        signal: AbortSignal.any([
          options.signal,
          AbortSignal.timeout(timeoutMs()),
        ]),
      } as { idempotencyKey?: string };

      const result = await client.emails.send(
        {
          from: applyDisplayName(from, message.fromName),
          to: [message.to],
          subject: message.subject,
          html: message.html,
          ...(message.text ? { text: message.text } : {}),
          ...(message.tags ? { tags: message.tags } : {}),
        },
        requestOptions,
      );

      if (result.error) throw toMailSendError(result.error, result.headers);
      if (!result.data?.id) {
        throw new MailSendError("Resend trả về phản hồi không có id", {
          code: "missing_message_id",
          scope: "transient",
        });
      }

      return {
        providerMessageId: result.data.id,
        headers: result.headers ?? undefined,
      };
    },
  };
}
