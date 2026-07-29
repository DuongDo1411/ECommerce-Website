// Chọn và dựng provider mail.
//
// KHÔNG suy provider từ việc "biến nào có mặt". Suy ngầm nghe thì tiện nhưng hỏng đúng lúc
// nguy hiểm nhất: quên đặt RESEND_API_KEY ở production thì hệ thống lặng lẽ tụt về Gmail
// (hoặc tệ hơn, về console) và không ai biết cho tới khi khách hỏi vì sao không nhận mail.
// Ở đây phải khai báo rõ MAIL_PROVIDER, và thiếu cấu hình thì server từ chối khởi động.

import { createConsoleProvider } from "./providers/console";
import { createResendProvider } from "./providers/resend";
import { createSmtpProvider } from "./providers/smtp";
import type { MailProvider, MailProviderName } from "./types";

export interface MailEnvironment {
  MAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
  MAIL_FROM?: string;
  GMAIL_USER?: string;
  GMAIL_APP_PASSWORD?: string;
  ADMIN_EMAIL?: string;
  NODE_ENV?: string;
}

const PROVIDER_NAMES: readonly MailProviderName[] = [
  "resend",
  "smtp",
  "console",
];

export class MailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailConfigurationError";
  }
}

function isProduction(env: MailEnvironment): boolean {
  return env.NODE_ENV === "production";
}

function value(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Hàm THUẦN để test được bảng chọn provider mà không phải chọc vào process.env thật.
 * Ném lỗi thay vì đoán bừa khi cấu hình không rõ ràng.
 */
export function resolveProviderName(
  env: MailEnvironment = process.env,
): MailProviderName {
  const declared = value(env.MAIL_PROVIDER)?.toLowerCase();

  if (declared) {
    const match = PROVIDER_NAMES.find((name) => name === declared);
    if (!match) {
      throw new MailConfigurationError(
        `MAIL_PROVIDER="${declared}" không hợp lệ. Chọn một trong: ${PROVIDER_NAMES.join(", ")}.`,
      );
    }
    return match;
  }

  if (isProduction(env)) {
    throw new MailConfigurationError(
      "Production bắt buộc khai báo MAIL_PROVIDER (resend | smtp).",
    );
  }

  // Mặc định khi phát triển: in ra terminal. Đây là hằng số cố định, không phải suy diễn
  // từ biến khác — chạy dev mà chưa cấu hình gì thì không được lỡ tay gửi mail thật.
  return "console";
}

/**
 * Gọi lúc khởi động (server.ts). Thà chết ngay lúc boot với thông điệp rõ ràng còn hơn
 * chết lúc 2 giờ sáng ở request đầu tiên cần gửi OTP.
 */
export function validateMailConfiguration(
  env: MailEnvironment = process.env,
): MailProviderName {
  const name = resolveProviderName(env);
  const production = isProduction(env);
  const missing: string[] = [];

  if (name === "console" && production) {
    throw new MailConfigurationError(
      "MAIL_PROVIDER=console bị cấm ở production — mail sẽ chỉ in ra log, không ai nhận được.",
    );
  }

  if (name === "resend") {
    if (!value(env.RESEND_API_KEY)) missing.push("RESEND_API_KEY");
    if (!value(env.MAIL_FROM)) missing.push("MAIL_FROM");
    // Thiếu secret thì webhook không verify được chữ ký, và không verify được thì không
    // có cách nào biết mail đã tới hay bị bounce — chỉ biết Resend đã "nhận".
    if (!value(env.RESEND_WEBHOOK_SECRET)) {
      missing.push("RESEND_WEBHOOK_SECRET");
    }
  }

  if (name === "smtp") {
    if (!value(env.GMAIL_USER)) missing.push("GMAIL_USER");
    if (!value(env.GMAIL_APP_PASSWORD)) missing.push("GMAIL_APP_PASSWORD");
  }

  // Người nhận mail escalate. Thiếu ở production nghĩa là case trọng tài không ai hay.
  if (production && !value(env.ADMIN_EMAIL)) missing.push("ADMIN_EMAIL");

  if (missing.length > 0) {
    throw new MailConfigurationError(
      `Cấu hình mail thiếu biến bắt buộc cho MAIL_PROVIDER=${name}: ${missing.join(", ")}.`,
    );
  }

  return name;
}

let cached: MailProvider | null = null;

export function getMailProvider(
  env: MailEnvironment = process.env,
): MailProvider {
  if (cached) return cached;

  const name = validateMailConfiguration(env);
  switch (name) {
    case "resend":
      cached = createResendProvider(
        value(env.RESEND_API_KEY)!,
        value(env.MAIL_FROM)!,
      );
      break;
    case "smtp":
      cached = createSmtpProvider(
        value(env.GMAIL_USER)!,
        value(env.GMAIL_APP_PASSWORD)!,
      );
      break;
    case "console":
      cached = createConsoleProvider();
      break;
  }
  return cached;
}

/** Chỉ dùng cho test: quên provider đang cache để lần sau dựng lại theo env mới. */
export function resetMailProvider() {
  cached = null;
}
