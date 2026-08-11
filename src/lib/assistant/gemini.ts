// Adapter mỏng quanh Gemini Interactions API (@google/genai). Mẫu theo
// src/lib/ghn.ts (ghnRequest/GHNError): fail-closed Ở THỜI ĐIỂM GỌI khi thiếu cấu
// hình, bọc lỗi thành kiểu riêng thay vì để lỗi thô của SDK rơi ra ngoài route.
//
// Toàn bộ shape field (input là Step[], tool là {type:"function",...}, response có
// steps/output_text) đã xác minh trực tiếp từ node_modules/@google/genai/dist/genai.d.ts
// sau khi cài @google/genai@^2.16.0 — không suy đoán từ tài liệu web.

import { ApiError, GoogleGenAI } from "@google/genai";
import { AssistantError } from "@/lib/assistant/types";
import { consumeRateLimit } from "@/lib/security/rateLimit";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";
const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_TOKENS = 700;

// Hạn ngạch toàn cục bảo vệ quota Gemini dùng chung của cả ứng dụng — tiêu thụ
// NGAY TRƯỚC mỗi lời gọi `interactions.create` thật, đặt ở đây (không phải ở
// route) vì một lượt chat của orchestrator có thể gọi hàm này tới 3 lần
// (vòng lặp function-call), mỗi lần đều phải tính vào cùng một hạn ngạch.
const GLOBAL_RATE_LIMIT = { max: 8, windowMs: 60_000 };
const GLOBAL_RATE_LIMIT_KEY = "assistant:gemini:global";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AssistantError("Trợ lý AI chưa được cấu hình.", 503);
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export interface GeminiTextStep {
  type: "user_input" | "model_output";
  content: [{ type: "text"; text: string }];
  error?: unknown;
}

export interface GeminiFunctionCallStep {
  type: "function_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface GeminiFunctionResultStep {
  type: "function_result";
  call_id: string;
  name?: string;
  is_error?: boolean;
  result: unknown;
}

export type GeminiStep =
  | GeminiTextStep
  | GeminiFunctionCallStep
  | GeminiFunctionResultStep;

export interface GeminiTool {
  type: "function";
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface GeminiInteractionResult {
  steps: GeminiStep[];
  outputText: string;
}

/**
 * Gọi một lượt Gemini Interactions API. Stateless có chủ đích — không đặt
 * `previous_interaction_id`, không `store`; toàn bộ ngữ cảnh (kể cả các bước
 * function_call/function_result trong cùng một lượt hỏi) được truyền lại qua
 * tham số `input`.
 */
export async function createGeminiInteraction(
  input: GeminiStep[],
  tools: GeminiTool[],
  systemInstruction: string,
): Promise<GeminiInteractionResult> {
  const ai = getClient();

  const globalLimit = await consumeRateLimit(GLOBAL_RATE_LIMIT_KEY, GLOBAL_RATE_LIMIT);
  if (!globalLimit.allowed) {
    throw new AssistantError(
      "Trợ lý AI đang có nhiều người hỏi cùng lúc, vui lòng thử lại sau.",
      429,
      globalLimit.retryAfterSeconds,
    );
  }

  try {
    const interaction = await ai.interactions.create(
      {
        model: MODEL,
        input: input as never,
        tools: tools as never,
        system_instruction: systemInstruction,
        store: false,
        generation_config: { max_output_tokens: MAX_OUTPUT_TOKENS },
      },
      { timeout: TIMEOUT_MS },
    );

    return {
      steps: (interaction.steps ?? []) as GeminiStep[],
      outputText: interaction.output_text ?? "",
    };
  } catch (error) {
    const isTimeout =
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && /timeout/i.test(error.message));
    if (isTimeout) {
      throw new AssistantError("Trợ lý AI phản hồi quá lâu, vui lòng thử lại.", 504);
    }
    if (error instanceof AssistantError) throw error;
    if (error instanceof ApiError) {
      throw new AssistantError("Trợ lý AI đang gặp sự cố, vui lòng thử lại sau.", 502);
    }
    throw new AssistantError("Trợ lý AI đang gặp sự cố, vui lòng thử lại sau.", 502);
  }
}
