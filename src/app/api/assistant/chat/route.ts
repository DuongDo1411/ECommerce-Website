import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { apiErrorMessage } from "@/lib/apiError";
import { runAssistantTurn } from "@/lib/assistant/chat";
import { AssistantError, type AssistantMessage } from "@/lib/assistant/types";
import { clientIp, consumeRateLimit } from "@/lib/security/rateLimit";
import { readLimitedJsonBody } from "@/lib/security/requestBody";
import { noStoreJson } from "@/lib/security/response";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_TOTAL_CHARS = 6000;

const GUEST_COOKIE = "assistant_guest_id";
const PERSONAL_RATE_LIMIT = { max: 4, windowMs: 60_000 };

function parseHistory(raw: unknown): AssistantMessage[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY_MESSAGES) {
    throw new AssistantError("Lịch sử hội thoại không hợp lệ.", 400);
  }

  let totalChars = 0;
  const messages: AssistantMessage[] = [];
  for (const entry of raw) {
    const role = (entry as { role?: unknown } | null)?.role;
    const content = (entry as { content?: unknown } | null)?.content;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" ||
      content.length === 0 ||
      content.length > MAX_MESSAGE_LENGTH
    ) {
      throw new AssistantError("Lịch sử hội thoại không hợp lệ.", 400);
    }
    totalChars += content.length;
    if (totalChars > MAX_HISTORY_TOTAL_CHARS) {
      throw new AssistantError("Lịch sử hội thoại vượt quá giới hạn cho phép.", 400);
    }
    messages.push({ role, content });
  }
  return messages;
}

/** Đính cookie guest id (nếu vừa cấp mới) vào response ngay trước khi trả về. */
function attachGuestCookie(
  res: NextResponse,
  guestId: string | null,
): NextResponse {
  if (!guestId) return res;
  res.cookies.set(GUEST_COOKIE, guestId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await readLimitedJsonBody(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RangeError) {
      return noStoreJson({ message: "Nội dung yêu cầu quá lớn." }, { status: 413 });
    }
    return noStoreJson({ message: "Yêu cầu không hợp lệ." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return noStoreJson({ message: "Yêu cầu không hợp lệ." }, { status: 400 });
  }
  const { message, history: rawHistory } = body as Record<string, unknown>;

  if (
    typeof message !== "string" ||
    message.trim().length === 0 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return noStoreJson({ message: "Nội dung câu hỏi không hợp lệ." }, { status: 400 });
  }

  let history: AssistantMessage[];
  try {
    history = parseHistory(rawHistory);
  } catch (error) {
    const status = error instanceof AssistantError ? error.status : 400;
    const msg = error instanceof AssistantError ? error.message : "Yêu cầu không hợp lệ.";
    return noStoreJson({ message: msg }, { status });
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Định danh để giới hạn tần suất: user đăng nhập khóa theo user id, guest khóa
  // theo IP (chỉ tin khi TRUST_PROXY=true) hoặc cookie assistant_guest_id do
  // chính route này cấp — cookie không phải chống lạm dụng tuyệt đối. Đây chỉ
  // là bucket CÁ NHÂN; hạn ngạch TOÀN CỤC bảo vệ quota Gemini dùng chung được
  // tiêu thụ ở gemini.ts ngay trước mỗi lời gọi thật, không ở đây — một lượt
  // chat có thể gọi Gemini nhiều lần (vòng lặp function-call) nên phải tính ở
  // đúng chỗ gọi, không phải một lần cho cả request.
  let newGuestId: string | null = null;
  let personalKey: string;
  if (userId) {
    personalKey = `assistant:user:${userId}`;
  } else {
    const ip = clientIp(req.headers);
    if (ip) {
      personalKey = `assistant:ip:${ip}`;
    } else {
      const existingGuestId = req.cookies.get(GUEST_COOKIE)?.value;
      const guestId = existingGuestId || randomUUID();
      if (!existingGuestId) newGuestId = guestId;
      personalKey = `assistant:guest:${guestId}`;
    }
  }

  const personalLimit = await consumeRateLimit(personalKey, PERSONAL_RATE_LIMIT);
  if (!personalLimit.allowed) {
    const res = noStoreJson(
      { message: "Bạn đang hỏi quá nhanh, vui lòng thử lại sau." },
      {
        status: 429,
        headers: { "Retry-After": String(personalLimit.retryAfterSeconds) },
      },
    );
    return attachGuestCookie(res, newGuestId);
  }

  try {
    const result = await runAssistantTurn({ message: message.trim(), history, userId });
    return attachGuestCookie(noStoreJson(result), newGuestId);
  } catch (error) {
    if (error instanceof AssistantError) {
      const headers: HeadersInit | undefined =
        typeof error.retryAfterSeconds === "number"
          ? { "Retry-After": String(error.retryAfterSeconds) }
          : undefined;
      return attachGuestCookie(
        noStoreJson({ message: error.message }, { status: error.status, headers }),
        newGuestId,
      );
    }
    return attachGuestCookie(
      noStoreJson(
        { message: apiErrorMessage("Assistant chat error", error) },
        { status: 500 },
      ),
      newGuestId,
    );
  }
}
