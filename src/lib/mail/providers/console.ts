// Provider console — in mail ra terminal thay vì gửi thật.
//
// Dùng khi phát triển và trong CI: test được toàn bộ luồng outbox (queue, claim, retry,
// accepted) mà không cần API key, không đốt quota, không lỡ tay gửi mail cho người thật
// bằng dữ liệu seed. validateMailConfiguration() cấm provider này ở production.

import {
  type MailMessage,
  type MailProvider,
  type MailSendOptions,
  type MailSendResult,
} from "../types";

const PREVIEW_LENGTH = 200;

export function createConsoleProvider(): MailProvider {
  return {
    name: "console",
    async send(
      message: MailMessage,
      options: MailSendOptions,
    ): Promise<MailSendResult> {
      const preview = message.html
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, PREVIEW_LENGTH);

      console.log(
        [
          "[MAIL:console]",
          `to=${message.to}`,
          `subject=${message.subject}`,
          `priority=${options.priority}`,
          options.idempotencyKey ? `key=${options.idempotencyKey}` : "",
          `html=${message.html.length} ký tự`,
        ]
          .filter(Boolean)
          .join(" "),
      );
      console.log(`[MAIL:console] ${preview}`);

      return {
        providerMessageId: `console-${Math.random().toString(36).slice(2, 12)}`,
      };
    },
  };
}
