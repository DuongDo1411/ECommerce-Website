import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGeminiInteraction: vi.fn(),
  executeTool: vi.fn(),
}));

vi.mock("@/lib/assistant/gemini", () => ({
  createGeminiInteraction: mocks.createGeminiInteraction,
}));

vi.mock("@/lib/assistant/tools", () => ({
  buildTools: vi.fn(() => []),
  executeTool: mocks.executeTool,
}));

vi.mock("@/lib/assistant/systemPrompt", () => ({
  buildSystemInstruction: vi.fn(() => "system"),
}));

import { runAssistantTurn } from "./chat";
import type { GeminiInteractionResult, GeminiStep } from "@/lib/assistant/gemini";
import type { AssistantProductCard } from "@/lib/assistant/types";

function textResult(text: string): GeminiInteractionResult {
  return {
    steps: [{ type: "model_output", content: [{ type: "text", text }] }],
    outputText: text,
  };
}

function functionCallResult(
  id: string,
  name: string,
  args: Record<string, unknown>,
): GeminiInteractionResult {
  return {
    steps: [{ type: "function_call", id, name, arguments: args }],
    outputText: "",
  };
}

function textOf(input: GeminiStep[]): string[] {
  return input.flatMap((step) =>
    step.type === "user_input" || step.type === "model_output"
      ? step.content.map((c) => c.text)
      : [],
  );
}

describe("runAssistantTurn (orchestrator)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("câu hỏi hiện tại chỉ xuất hiện đúng một lần trong input gửi Gemini", async () => {
    mocks.createGeminiInteraction.mockResolvedValueOnce(textResult("Xin chào"));

    await runAssistantTurn({ message: "Áo còn size M không?", history: [], userId: null });

    const [input] = mocks.createGeminiInteraction.mock.calls[0] as [GeminiStep[]];
    const occurrences = textOf(input).filter((t) => t === "Áo còn size M không?").length;
    expect(occurrences).toBe(1);
  });

  it("lịch sử client không tạo step model_output — chỉ user_input", async () => {
    mocks.createGeminiInteraction.mockResolvedValueOnce(textResult("OK"));

    await runAssistantTurn({
      message: "Câu hỏi mới",
      history: [
        { role: "user", content: "Câu cũ" },
        { role: "assistant", content: "Trả lời cũ" },
      ],
      userId: null,
    });

    const [input] = mocks.createGeminiInteraction.mock.calls[0] as [GeminiStep[]];
    expect(input.every((step) => step.type === "user_input")).toBe(true);
  });

  it("giữ nguyên step function_call thật của Gemini vào vòng function-call tiếp theo", async () => {
    mocks.createGeminiInteraction
      .mockResolvedValueOnce(functionCallResult("call-1", "search_products", { keywords: "áo" }))
      .mockResolvedValueOnce(textResult("Đây là kết quả"));
    mocks.executeTool.mockResolvedValueOnce({ resultForModel: { products: [] } });

    await runAssistantTurn({ message: "tìm áo", history: [], userId: null });

    const [secondInput] = mocks.createGeminiInteraction.mock.calls[1] as [GeminiStep[]];
    const hasCall = secondInput.some((s) => s.type === "function_call" && s.id === "call-1");
    const hasResult = secondInput.some(
      (s) => s.type === "function_result" && s.call_id === "call-1",
    );
    expect(hasCall).toBe(true);
    expect(hasResult).toBe(true);
  });

  it("xử lý nhiều function_call trong cùng một vòng", async () => {
    mocks.createGeminiInteraction
      .mockResolvedValueOnce({
        steps: [
          { type: "function_call", id: "c1", name: "search_products", arguments: {} },
          {
            type: "function_call",
            id: "c2",
            name: "get_ecoshop_policy",
            arguments: { topic: "shipping" },
          },
        ],
        outputText: "",
      })
      .mockResolvedValueOnce(textResult("Xong"));
    mocks.executeTool.mockResolvedValue({ resultForModel: {} });

    const result = await runAssistantTurn({ message: "hỏi hai thứ", history: [], userId: null });

    expect(mocks.executeTool).toHaveBeenCalledTimes(2);
    expect(result.reply).toBe("Xong");
  });

  it("tool lạ vẫn đi qua executeTool để dispatch (không tự chặn ở orchestrator)", async () => {
    mocks.createGeminiInteraction
      .mockResolvedValueOnce(functionCallResult("c1", "unknown_tool", {}))
      .mockResolvedValueOnce(textResult("Xong"));
    mocks.executeTool.mockResolvedValueOnce({
      resultForModel: { error: "Tool không xác định: unknown_tool" },
    });

    const result = await runAssistantTurn({ message: "?", history: [], userId: null });

    expect(mocks.executeTool).toHaveBeenCalledWith("unknown_tool", {}, { userId: null });
    expect(result.reply).toBe("Xong");
  });

  it("vượt quá 4 tool call trong một lượt thì không gọi thêm tool", async () => {
    mocks.createGeminiInteraction
      .mockResolvedValueOnce({
        steps: Array.from({ length: 5 }, (_, i) => ({
          type: "function_call" as const,
          id: `c${i}`,
          name: "search_products",
          arguments: {},
        })),
        outputText: "",
      })
      .mockResolvedValueOnce(textResult("Xong"));
    mocks.executeTool.mockResolvedValue({ resultForModel: {} });

    await runAssistantTurn({ message: "?", history: [], userId: null });

    expect(mocks.executeTool).toHaveBeenCalledTimes(4);
  });

  it("vượt quá 3 vòng thì dừng và trả lời xin lỗi thay vì lặp vô hạn", async () => {
    mocks.createGeminiInteraction.mockResolvedValue(
      functionCallResult("cX", "search_products", {}),
    );
    mocks.executeTool.mockResolvedValue({ resultForModel: {} });

    const result = await runAssistantTurn({ message: "?", history: [], userId: null });

    expect(mocks.createGeminiInteraction).toHaveBeenCalledTimes(3);
    expect(result.reply).toContain("nhiều bước hơn");
  });

  it("dedupe product card theo id khi nhiều tool call trả trùng sản phẩm", async () => {
    mocks.createGeminiInteraction
      .mockResolvedValueOnce({
        steps: [
          { type: "function_call", id: "c1", name: "search_products", arguments: {} },
          { type: "function_call", id: "c2", name: "search_products", arguments: {} },
        ],
        outputText: "",
      })
      .mockResolvedValueOnce(textResult("Xong"));
    const product: AssistantProductCard = {
      id: "p1",
      title: "Áo",
      price: 100_000,
      image: null,
      category: "a",
      shopName: "s",
      inStock: true,
      payOnDelivery: false,
      freeDelivery: false,
      replacementDays: null,
      availableSizes: [],
      warranty: null,
      url: "/product/p1",
    };
    mocks.executeTool.mockResolvedValue({ resultForModel: { products: [product] }, products: [product] });

    const result = await runAssistantTurn({ message: "tìm áo", history: [], userId: null });

    expect(result.products).toHaveLength(1);
  });
});
