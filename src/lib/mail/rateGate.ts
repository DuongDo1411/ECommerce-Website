// Điều tiết tốc độ gọi provider mail.
//
// Vì sao bắt buộc phải có: cron process-returns quét tới 200 case một lượt và mỗi case có
// thể sinh một mail. Bắn thẳng 200 request thì Resend trả 429 hàng loạt, và cái giá không
// chỉ là chậm — mỗi 429 là một lần retry, một lần đốt attempt.
//
// Hàng đợi có ƯU TIÊN chứ không thuần FIFO: OTP đang chặn response của người dùng, không
// thể xếp sau 200 job nền. Ưu tiên được chọn lúc LẤY RA khỏi hàng đợi, nên một OTP đến sau
// vẫn vượt lên trước đám job nền chưa kịp khởi động.
//
// GIỚI HẠN: trạng thái nằm trong bộ nhớ của MỘT process. Dự án chạy custom Node server
// (server.ts) nên hiện tại đúng. Ngày nào chạy nhiều instance thì phải thay bằng rate
// limiter phân tán (Redis), nếu không mỗi instance sẽ tự cho mình trọn hạn mức.

import type { MailPriority } from "./types";

const DEFAULT_RATE_PER_SECOND = 4;
const DEFAULT_MAX_CONCURRENT = 2;
const MIN_RATE = 1;
const MAX_RATE = 50;

interface Waiter {
  priority: MailPriority;
  seq: number;
  resolve: () => void;
}

function envRatePerSecond(): number {
  const raw = Number(process.env.MAIL_RATE_PER_SECOND);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RATE_PER_SECOND;
  return Math.min(MAX_RATE, Math.max(MIN_RATE, Math.floor(raw)));
}

let ratePerSecond = envRatePerSecond();
let maxConcurrent = DEFAULT_MAX_CONCURRENT;
let tokens = ratePerSecond;
let lastRefillAt = Date.now();
let inFlight = 0;
let seqCounter = 0;
const waiters: Waiter[] = [];
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function refill(now: number) {
  const elapsedMs = now - lastRefillAt;
  if (elapsedMs <= 0) return;
  lastRefillAt = now;
  tokens = Math.min(ratePerSecond, tokens + (elapsedMs * ratePerSecond) / 1000);
}

/** High trước normal; trong cùng mức ưu tiên thì ai xếp hàng trước đi trước. */
function takeNextWaiter(): Waiter | undefined {
  let bestIndex = -1;
  for (let i = 0; i < waiters.length; i++) {
    const candidate = waiters[i];
    if (bestIndex === -1) {
      bestIndex = i;
      continue;
    }
    const best = waiters[bestIndex];
    const candidateWins =
      candidate.priority === best.priority
        ? candidate.seq < best.seq
        : candidate.priority === "high";
    if (candidateWins) bestIndex = i;
  }
  return bestIndex === -1 ? undefined : waiters.splice(bestIndex, 1)[0];
}

function schedulePump() {
  if (pumpTimer || waiters.length === 0) return;
  // Nghẽn vì hết token thì hẹn đúng lúc token kế tiếp chín. Nghẽn vì đủ số request đang
  // chạy thì không cần timer — release() sẽ đánh thức.
  if (inFlight >= maxConcurrent) return;
  const deficit = Math.max(0, 1 - tokens);
  const waitMs = Math.ceil((deficit / ratePerSecond) * 1000) || 1;
  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    pump();
  }, waitMs);
  // Đừng giữ process sống chỉ vì một timer điều tiết.
  pumpTimer.unref?.();
}

function pump() {
  refill(Date.now());
  while (waiters.length > 0 && inFlight < maxConcurrent && tokens >= 1) {
    const waiter = takeNextWaiter();
    if (!waiter) break;
    tokens -= 1;
    inFlight += 1;
    waiter.resolve();
  }
  schedulePump();
}

function acquire(priority: MailPriority): Promise<void> {
  return new Promise<void>((resolve) => {
    waiters.push({ priority, seq: seqCounter++, resolve });
    pump();
  });
}

function release() {
  inFlight = Math.max(0, inFlight - 1);
  pump();
}

/**
 * Chạy task dưới hạn mức tốc độ dùng chung. Lỗi của task được ném lại nguyên vẹn, nhưng
 * slot LUÔN được trả — nuốt mất một slot là dần dần treo cả hàng đợi.
 */
export async function withMailRate<T>(
  priority: MailPriority,
  task: () => Promise<T>,
): Promise<T> {
  await acquire(priority);
  try {
    return await task();
  } finally {
    release();
  }
}

/** Chỉ dùng cho test: đặt lại hạn mức và dọn sạch trạng thái. */
export function resetMailRateGate(config?: {
  ratePerSecond?: number;
  maxConcurrent?: number;
}) {
  if (pumpTimer) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
  ratePerSecond = config?.ratePerSecond ?? envRatePerSecond();
  maxConcurrent = config?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  tokens = ratePerSecond;
  lastRefillAt = Date.now();
  inFlight = 0;
  seqCounter = 0;
  waiters.length = 0;
}
