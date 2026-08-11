import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  const create = vi.fn();
  class MockGoogleGenAI {
    interactions = { create };
  }
  const consumeRateLimit = vi.fn();
  return { create, MockApiError, MockGoogleGenAI, consumeRateLimit };
});
const { MockApiError } = mocks;

vi.mock("@google/genai", () => ({
  GoogleGenAI: mocks.MockGoogleGenAI,
  ApiError: mocks.MockApiError,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

import { createGeminiInteraction } from "./gemini";
import { AssistantError } from "./types";

describe("createGeminiInteraction (Gemini adapter)", () => {
  beforeEach(() => {
    // Mặc định hạn ngạch toàn cục còn chỗ — test riêng "hết quota" sẽ override.
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 7, retryAfterSeconds: 0 });
  });

  afterEach(() => {
    // resetAllMocks (không chỉ clearAllMocks) để xóa cả các mockResolvedValue
    // "bền" của test trước — tránh một test để lại hành vi mock rò sang test sau.
    vi.resetAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it("fail-closed khi thiếu GEMINI_API_KEY — không gọi SDK", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(createGeminiInteraction([], [], "system")).rejects.toMatchObject({
      status: 503,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("mỗi lời gọi interactions.create tiêu thụ đúng một đơn vị hạn ngạch toàn cục", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.create.mockResolvedValue({ id: "i", status: "completed", steps: [], output_text: "ok" });

    await createGeminiInteraction([], [], "system");

    expect(mocks.consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(
      "assistant:gemini:global",
      expect.objectContaining({ max: 8 }),
    );
  });

  it("ba lần gọi (mô phỏng ba vòng function-call) tiêu thụ ba đơn vị hạn ngạch", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.create.mockResolvedValue({ id: "i", status: "completed", steps: [], output_text: "ok" });

    await createGeminiInteraction([], [], "system");
    await createGeminiInteraction([], [], "system");
    await createGeminiInteraction([], [], "system");

    expect(mocks.consumeRateLimit).toHaveBeenCalledTimes(3);
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });

  it("hết hạn ngạch toàn cục thì KHÔNG gọi SDK, trả 429 kèm retryAfterSeconds", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.consumeRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    await expect(createGeminiInteraction([], [], "system")).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 42,
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("parse đúng nhánh function_call trong steps", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.create.mockResolvedValueOnce({
      id: "int-1",
      status: "requires_action",
      steps: [
        {
          type: "function_call",
          id: "call-1",
          name: "search_products",
          arguments: { keywords: "áo" },
        },
      ],
      output_text: "",
    });

    const result = await createGeminiInteraction([], [], "system");

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ type: "function_call", name: "search_products" });
    expect(result.outputText).toBe("");
  });

  it("parse đúng nhánh text cuối khi không có function_call", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.create.mockResolvedValueOnce({
      id: "int-2",
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "Xin chào" }] }],
      output_text: "Xin chào",
    });

    const result = await createGeminiInteraction([], [], "system");

    expect(result.outputText).toBe("Xin chào");
    expect(result.steps.some((s) => s.type === "function_call")).toBe(false);
  });

  it("bọc lỗi ApiError (429 hết quota) thành AssistantError 502, không lộ message gốc", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.create.mockRejectedValueOnce(new MockApiError("quota exceeded for project X", 429));

    await expect(createGeminiInteraction([], [], "system")).rejects.toBeInstanceOf(AssistantError);
    try {
      await createGeminiInteraction([], [], "system");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AssistantError);
      expect((error as AssistantError).status).toBe(502);
      expect((error as AssistantError).message).not.toContain("quota exceeded");
    }
  });

  it("timeout (AbortError) trả AssistantError 504", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.create.mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"));

    await expect(createGeminiInteraction([], [], "system")).rejects.toMatchObject({
      status: 504,
    });
  });

  it("lỗi không xác định cũng bị bọc lại, không rơi ra ngoài nguyên văn", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    mocks.create.mockRejectedValueOnce(new Error("ECONNRESET"));

    await expect(createGeminiInteraction([], [], "system")).rejects.toBeInstanceOf(AssistantError);
  });
});
