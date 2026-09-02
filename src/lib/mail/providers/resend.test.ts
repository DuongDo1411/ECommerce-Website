// Provider Resend: payload gửi lên và — quan trọng hơn — cách dịch lỗi.
//
// Test chạy qua SDK THẬT, chỉ stub globalThis.fetch. Làm vậy để bắt được cả hành vi riêng
// của SDK: nó không ném lỗi mà gói mọi thứ vào { data, error, headers }, kể cả khi đứt mạng.
//
// Bất biến đắt giá nhất ở đây: cùng HTTP 429 nhưng "gọi quá nhanh" và "hết quota tháng" là
// hai số phận khác hẳn. Phân loại theo status là sai; phải đọc error.name.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MailSendError } from "../types";
import { applyDisplayName, createResendProvider } from "./resend";

const API_KEY = "re_test_key";
const FROM = "MultiCart <no-reply@mail.example.com>";

const MESSAGE = {
  to: "buyer@example.com",
  subject: "Chủ đề thử",
  html: "<p>Nội dung</p>",
};

const SEND_OPTIONS = {
  signal: new AbortController().signal,
  priority: "normal" as const,
};

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), { status, headers });
}

function errorResponse(
  name: string,
  statusCode: number,
  headers: Record<string, string> = {},
) {
  return jsonResponse(
    { name, statusCode, message: `mô phỏng ${name}` },
    statusCode,
    headers,
  );
}

/** Gửi và bắt lấy MailSendError để soi scope/retryable. */
async function sendExpectingError(response: Response | Error) {
  fetchMock.mockImplementation(() =>
    response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response),
  );
  const provider = createResendProvider(API_KEY, FROM);
  try {
    await provider.send(MESSAGE, SEND_OPTIONS);
  } catch (error) {
    return error as MailSendError;
  }
  throw new Error("mong đợi provider ném lỗi nhưng nó thành công");
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applyDisplayName", () => {
  it("giữ nguyên MAIL_FROM khi không có fromName", () => {
    expect(applyDisplayName(FROM)).toBe(FROM);
    expect(applyDisplayName(FROM, "   ")).toBe(FROM);
  });

  it("chỉ đổi tên hiển thị, giữ nguyên địa chỉ đã verify", () => {
    expect(applyDisplayName(FROM, "Bộ phận CSKH")).toBe(
      '"Bộ phận CSKH" <no-reply@mail.example.com>',
    );
  });

  it("hoạt động với MAIL_FROM dạng địa chỉ trần", () => {
    expect(applyDisplayName("no-reply@mail.example.com", "MultiCart")).toBe(
      '"MultiCart" <no-reply@mail.example.com>',
    );
  });

  it("loại ký tự có thể bẻ header From", () => {
    expect(applyDisplayName(FROM, 'Kẻ "xấu" <evil@x.com>')).toBe(
      '"Kẻ xấu evil@x.com" <no-reply@mail.example.com>',
    );
  });
});

describe("gửi thành công", () => {
  it("gọi đúng endpoint với Authorization và payload đầy đủ", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "msg_123" }, 200));

    const result = await createResendProvider(API_KEY, FROM).send(
      { ...MESSAGE, fromName: "MultiCart" },
      SEND_OPTIONS,
    );

    expect(result.providerMessageId).toBe("msg_123");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/emails");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Bearer ${API_KEY}`,
    );
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      from: '"MultiCart" <no-reply@mail.example.com>',
      to: ["buyer@example.com"],
      subject: "Chủ đề thử",
      html: "<p>Nội dung</p>",
    });
  });

  it("trả lại response headers để worker đọc được hạn mức", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ id: "msg_1" }, 200, { "ratelimit-remaining": "7" }),
    );

    const result = await createResendProvider(API_KEY, FROM).send(
      MESSAGE,
      SEND_OPTIONS,
    );

    expect(result.headers?.["ratelimit-remaining"]).toBe("7");
  });

  it("có idempotencyKey thì gửi kèm header Idempotency-Key", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "msg_1" }, 200));

    await createResendProvider(API_KEY, FROM).send(MESSAGE, {
      ...SEND_OPTIONS,
      idempotencyKey: "outbox-abc",
    });

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("idempotency-key")).toBe("outbox-abc");
  });

  it("không có idempotencyKey thì không gửi header đó", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "msg_1" }, 200));

    await createResendProvider(API_KEY, FROM).send(MESSAGE, SEND_OPTIONS);

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.get("idempotency-key")).toBeNull();
  });

  it("truyền signal xuống fetch để timeout có hiệu lực", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "msg_1" }, 200));

    await createResendProvider(API_KEY, FROM).send(MESSAGE, SEND_OPTIONS);

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("phân loại lỗi", () => {
  it("validation_error là hỏng hẳn — gửi lại vẫn hỏng y hệt", async () => {
    const error = await sendExpectingError(
      errorResponse("validation_error", 422),
    );
    expect(error).toBeInstanceOf(MailSendError);
    expect(error.scope).toBe("message");
    expect(error.retryable).toBe(false);
  });

  it("invalid_from_address là hỏng hẳn", async () => {
    const error = await sendExpectingError(
      errorResponse("invalid_from_address", 403),
    );
    expect(error.scope).toBe("message");
  });

  it("invalid_idempotent_request là hỏng hẳn dù mang status 409", async () => {
    const error = await sendExpectingError(
      errorResponse("invalid_idempotent_request", 409),
    );
    expect(error.scope).toBe("message");
  });

  it("concurrent_idempotent_requests thì thử lại — chỉ là hai request đua nhau", async () => {
    const error = await sendExpectingError(
      errorResponse("concurrent_idempotent_requests", 409),
    );
    expect(error.scope).toBe("transient");
  });

  it("rate_limit_exceeded là transient và đọc ratelimit-reset", async () => {
    const error = await sendExpectingError(
      errorResponse("rate_limit_exceeded", 429, { "ratelimit-reset": "3" }),
    );
    expect(error.scope).toBe("transient");
    expect(error.retryAfterMs).toBe(3000);
  });

  it("retry-after được ưu tiên khi có", async () => {
    const error = await sendExpectingError(
      errorResponse("rate_limit_exceeded", 429, { "retry-after": "12" }),
    );
    expect(error.retryAfterMs).toBe(12_000);
  });

  it("daily_quota_exceeded là lỗi provider, hẹn 24 giờ, KHÔNG giết job", async () => {
    const error = await sendExpectingError(
      errorResponse("daily_quota_exceeded", 429),
    );
    expect(error.scope).toBe("provider");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(24 * 60 * 60_000);
  });

  it("monthly_quota_exceeded hẹn 6 giờ", async () => {
    const error = await sendExpectingError(
      errorResponse("monthly_quota_exceeded", 429),
    );
    expect(error.scope).toBe("provider");
    expect(error.retryAfterMs).toBe(6 * 60 * 60_000);
  });

  it("invalid_api_key là lỗi cấu hình, hẹn 1 giờ", async () => {
    const error = await sendExpectingError(
      errorResponse("invalid_api_key", 401),
    );
    expect(error.scope).toBe("provider");
    expect(error.retryAfterMs).toBe(60 * 60_000);
  });

  it("restricted_api_key là lỗi cấu hình", async () => {
    const error = await sendExpectingError(
      errorResponse("restricted_api_key", 401),
    );
    expect(error.scope).toBe("provider");
  });

  it("internal_server_error là transient", async () => {
    const error = await sendExpectingError(
      errorResponse("internal_server_error", 500),
    );
    expect(error.scope).toBe("transient");
  });

  it("đứt mạng: SDK gói thành application_error/statusCode null → transient", async () => {
    const error = await sendExpectingError(new Error("ECONNRESET"));
    expect(error.scope).toBe("transient");
    expect(error.code).toBe("application_error");
    expect(error.status).toBeUndefined();
  });

  it("mã lạ kèm 4xx thì coi là hỏng hẳn, không retry vô ích", async () => {
    const error = await sendExpectingError(errorResponse("brand_new_code", 400));
    expect(error.scope).toBe("message");
  });

  it("mã lạ kèm 503 thì vẫn thử lại", async () => {
    const error = await sendExpectingError(errorResponse("brand_new_code", 503));
    expect(error.scope).toBe("transient");
  });

  it("mã lạ kèm 451 là chuyện cấu hình, không phải mail hỏng", async () => {
    const error = await sendExpectingError(errorResponse("brand_new_code", 451));
    expect(error.scope).toBe("provider");
  });

  it("200 nhưng thiếu id thì coi là transient, không báo thành công giả", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 200));
    const provider = createResendProvider(API_KEY, FROM);
    await expect(provider.send(MESSAGE, SEND_OPTIONS)).rejects.toMatchObject({
      scope: "transient",
      code: "missing_message_id",
    });
  });
});
