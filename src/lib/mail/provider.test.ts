// Bảng chọn provider và cổng kiểm tra cấu hình lúc khởi động.
//
// Bất biến quan trọng nhất: KHÔNG suy provider từ việc "biến nào có mặt". Một hệ thống tự
// tụt về Gmail (hoặc console) khi thiếu RESEND_API_KEY là hệ thống hỏng im lặng — mail vẫn
// "gửi", chỉ là không ai nhận. Thà không khởi động được.

import { describe, expect, it } from "vitest";

import {
  MailConfigurationError,
  resolveProviderName,
  validateMailConfiguration,
  type MailEnvironment,
} from "./provider";

const RESEND_PROD: MailEnvironment = {
  MAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_test_key",
  RESEND_WEBHOOK_SECRET: "whsec_test",
  MAIL_FROM: "MultiCart <no-reply@mail.example.com>",
  ADMIN_EMAIL: "admin@example.com",
  NODE_ENV: "production",
};

describe("resolveProviderName", () => {
  it("nhận đúng cả ba provider khi khai báo rõ", () => {
    expect(resolveProviderName({ MAIL_PROVIDER: "resend" })).toBe("resend");
    expect(resolveProviderName({ MAIL_PROVIDER: "smtp" })).toBe("smtp");
    expect(resolveProviderName({ MAIL_PROVIDER: "console" })).toBe("console");
  });

  it("bỏ qua chữ hoa và khoảng trắng thừa", () => {
    expect(resolveProviderName({ MAIL_PROVIDER: "  ReSeNd  " })).toBe("resend");
  });

  it("KHÔNG suy provider từ sự có mặt của RESEND_API_KEY", () => {
    // Có key nhưng không khai báo → ở dev vẫn là console, không tự nhảy sang resend.
    expect(
      resolveProviderName({ RESEND_API_KEY: "re_test_key", NODE_ENV: "test" }),
    ).toBe("console");
  });

  it("KHÔNG suy provider từ sự có mặt của GMAIL_*", () => {
    expect(
      resolveProviderName({
        GMAIL_USER: "a@gmail.com",
        GMAIL_APP_PASSWORD: "x",
        NODE_ENV: "test",
      }),
    ).toBe("console");
  });

  it("giá trị lạ thì ném, không im lặng chọn bừa", () => {
    expect(() => resolveProviderName({ MAIL_PROVIDER: "sendgrid" })).toThrow(
      MailConfigurationError,
    );
  });

  it("production không khai báo MAIL_PROVIDER thì ném", () => {
    expect(() => resolveProviderName({ NODE_ENV: "production" })).toThrow(
      /bắt buộc khai báo MAIL_PROVIDER/i,
    );
  });

  it("dev không khai báo gì thì mặc định console", () => {
    expect(resolveProviderName({ NODE_ENV: "development" })).toBe("console");
  });
});

describe("validateMailConfiguration", () => {
  it("cấu hình resend đầy đủ thì đi qua", () => {
    expect(validateMailConfiguration(RESEND_PROD)).toBe("resend");
  });

  it("thiếu RESEND_API_KEY thì ném và nêu đúng tên biến", () => {
    const env = { ...RESEND_PROD, RESEND_API_KEY: undefined };
    expect(() => validateMailConfiguration(env)).toThrow(/RESEND_API_KEY/);
  });

  it("thiếu MAIL_FROM thì ném", () => {
    const env = { ...RESEND_PROD, MAIL_FROM: undefined };
    expect(() => validateMailConfiguration(env)).toThrow(/MAIL_FROM/);
  });

  it("thiếu RESEND_WEBHOOK_SECRET thì ném — không verify được thì mù trạng thái giao mail", () => {
    const env = { ...RESEND_PROD, RESEND_WEBHOOK_SECRET: undefined };
    expect(() => validateMailConfiguration(env)).toThrow(
      /RESEND_WEBHOOK_SECRET/,
    );
  });

  it("chuỗi rỗng hoặc toàn khoảng trắng bị coi như thiếu", () => {
    const env = { ...RESEND_PROD, RESEND_API_KEY: "   " };
    expect(() => validateMailConfiguration(env)).toThrow(/RESEND_API_KEY/);
  });

  it("smtp thiếu biến Gmail thì ném cả hai tên", () => {
    expect(() =>
      validateMailConfiguration({
        MAIL_PROVIDER: "smtp",
        ADMIN_EMAIL: "admin@example.com",
        NODE_ENV: "production",
      }),
    ).toThrow(/GMAIL_USER.*GMAIL_APP_PASSWORD/);
  });

  it("smtp đủ biến thì đi qua — đây là đường rollback hợp lệ", () => {
    expect(
      validateMailConfiguration({
        MAIL_PROVIDER: "smtp",
        GMAIL_USER: "shop@gmail.com",
        GMAIL_APP_PASSWORD: "app-password",
        ADMIN_EMAIL: "admin@example.com",
        NODE_ENV: "production",
      }),
    ).toBe("smtp");
  });

  it("console bị cấm ở production", () => {
    expect(() =>
      validateMailConfiguration({
        MAIL_PROVIDER: "console",
        ADMIN_EMAIL: "admin@example.com",
        NODE_ENV: "production",
      }),
    ).toThrow(/console bị cấm ở production/i);
  });

  it("production thiếu ADMIN_EMAIL thì ném — mail escalate sẽ không ai nhận", () => {
    const env = { ...RESEND_PROD, ADMIN_EMAIL: undefined };
    expect(() => validateMailConfiguration(env)).toThrow(/ADMIN_EMAIL/);
  });

  it("dev không bắt buộc ADMIN_EMAIL", () => {
    expect(
      validateMailConfiguration({
        MAIL_PROVIDER: "console",
        NODE_ENV: "development",
      }),
    ).toBe("console");
  });
});
