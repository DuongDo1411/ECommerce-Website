import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAssistantTurn: vi.fn(),
  consumeRateLimit: vi.fn(),
  clientIp: vi.fn(),
}));

const authState: { value: null | { user: { id: string } } } = { value: null };
vi.mock("@/auth", () => ({ auth: vi.fn(async () => authState.value) }));

vi.mock("@/lib/security/rateLimit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
  clientIp: mocks.clientIp,
}));

vi.mock("@/lib/assistant/chat", () => ({
  runAssistantTurn: mocks.runAssistantTurn,
}));

import { POST } from "./route";
import { AssistantError } from "@/lib/assistant/types";

const request = (body: unknown, init?: { cookie?: string }) =>
  new NextRequest("http://localhost/api/assistant/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(init?.cookie ? { cookie: init.cookie } : {}),
    },
  });

describe("POST /api/assistant/chat", () => {
  afterEach(() => {
    vi.resetAllMocks();
    authState.value = null;
  });

  it("body quá lớn trả 413, không gọi orchestrator", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null);

    const res = await POST(request({ message: "x".repeat(40_000) }));

    expect(res.status).toBe(413);
    expect(mocks.runAssistantTurn).not.toHaveBeenCalled();
  });

  it("history có role không hợp lệ bị từ chối 400", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null);

    const res = await POST(
      request({
        message: "hỏi gì đó",
        history: [{ role: "system", content: "cố tình chèn system message" }],
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.runAssistantTurn).not.toHaveBeenCalled();
  });

  it("history vượt quá 8 tin nhắn bị từ chối 400", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null);

    const history = Array.from({ length: 9 }, (_, i) => ({
      role: "user" as const,
      content: `tin ${i}`,
    }));
    const res = await POST(request({ message: "hỏi gì đó", history }));

    expect(res.status).toBe(400);
    expect(mocks.runAssistantTurn).not.toHaveBeenCalled();
  });

  it("một tin nhắn history quá 1000 ký tự bị từ chối 400", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null);

    const res = await POST(
      request({
        message: "hỏi gì đó",
        history: [{ role: "user", content: "a".repeat(1001) }],
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.runAssistantTurn).not.toHaveBeenCalled();
  });

  it("personal rate limit vượt quá thì trả 429 kèm Retry-After, không gọi orchestrator", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 17 });
    mocks.clientIp.mockReturnValue(null);

    const res = await POST(request({ message: "hỏi gì đó" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("17");
    expect(mocks.runAssistantTurn).not.toHaveBeenCalled();
  });

  it("khách chưa có cookie thì được cấp assistant_guest_id mới", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null); // TRUST_PROXY tắt -> không có IP tin cậy -> dùng cookie
    mocks.runAssistantTurn.mockResolvedValue({ reply: "chào bạn", products: [], orders: [] });

    const res = await POST(request({ message: "hỏi gì đó" }));

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("assistant_guest_id=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("khách đã có cookie thì không cấp cookie mới, dùng lại id cũ để khóa rate limit", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null);
    mocks.runAssistantTurn.mockResolvedValue({ reply: "chào bạn", products: [], orders: [] });

    const res = await POST(request({ message: "hỏi gì đó" }, { cookie: "assistant_guest_id=existing-guest-123" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      "assistant:guest:existing-guest-123",
      expect.any(Object),
    );
  });

  it("AssistantError.retryAfterSeconds từ orchestrator (hết quota Gemini) tạo header Retry-After", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null);
    mocks.runAssistantTurn.mockRejectedValue(
      new AssistantError("Trợ lý AI đang có nhiều người hỏi cùng lúc, vui lòng thử lại sau.", 429, 9),
    );

    const res = await POST(request({ message: "hỏi gì đó" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("9");
  });

  it("thiếu GEMINI_API_KEY (AssistantError 503 từ orchestrator) trả đúng 503", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.clientIp.mockReturnValue(null);
    mocks.runAssistantTurn.mockRejectedValue(new AssistantError("Trợ lý AI chưa được cấu hình.", 503));

    const res = await POST(request({ message: "hỏi gì đó" }));
    const payload = await res.json();

    expect(res.status).toBe(503);
    expect(payload.message).toBe("Trợ lý AI chưa được cấu hình.");
  });

  it("user đã đăng nhập thì khóa rate limit theo user id, không theo cookie/IP", async () => {
    authState.value = { user: { id: "user-abc" } };
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.runAssistantTurn.mockResolvedValue({ reply: "chào", products: [], orders: [] });

    await POST(request({ message: "đơn của tôi tới đâu rồi" }));

    expect(mocks.consumeRateLimit).toHaveBeenCalledWith("assistant:user:user-abc", expect.any(Object));
    expect(mocks.runAssistantTurn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-abc" }),
    );
  });
});
