// Áp dụng sự kiện giao mail của Resend vào outbox.
//
// Vì sao cần tầng này: "accepted" chỉ nghĩa là Resend ĐÃ NHẬN bức mail, không phải người
// nhận đã đọc được. Bounce, spam complaint, hộp thư không tồn tại — tất cả chỉ lộ ra qua
// webhook. Thiếu nó thì outbox toàn màu xanh trong khi mail rơi vào hư không.
//
// Thứ bậc trạng thái là phần dễ làm sai nhất. Sự kiện KHÔNG tới theo thứ tự: "delivered"
// có thể tới sau "bounced". Nếu cứ thấy sự kiện mới là ghi đè thì một bức mail đã bounce
// lại hiện thành đã giao. Nên mỗi trạng thái có một thứ hạng, và chỉ ghi đè được thứ hạng
// thấp hơn hoặc bằng.

import EmailOutbox, {
  type EmailDeliveryStatus,
} from "@/model/emailOutbox.model";
import EmailWebhookEvent, {
  type IEmailWebhookEvent,
} from "@/model/emailWebhookEvent.model";

const DAY_MS = 24 * 60 * 60_000;
const RETENTION_MS = 30 * DAY_MS;

/** Chỉ những loại sự kiện thực sự nói lên số phận bức mail. */
const STATUS_BY_TYPE: Record<string, EmailDeliveryStatus> = {
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
};

/**
 * Thứ hạng quyết định ai ghi đè được ai.
 *
 * Nhóm 3 (hỏng) thắng "delivered" vì chúng là tin xấu và tin xấu quan trọng hơn: một địa
 * chỉ vừa delivered vừa complained thì điều cần biết là complained.
 */
const RANK: Record<EmailDeliveryStatus, number> = {
  unknown: 0,
  delayed: 1,
  delivered: 2,
  failed: 3,
  bounced: 3,
  complained: 3,
  suppressed: 3,
};

const ALL_STATUSES = Object.keys(RANK) as EmailDeliveryStatus[];

/** Các trạng thái hiện tại mà `next` được phép ghi đè. */
function overridable(next: EmailDeliveryStatus): EmailDeliveryStatus[] {
  return ALL_STATUSES.filter((status) => RANK[status] <= RANK[next]);
}

export interface ResendWebhookPayload {
  type?: string;
  created_at?: string;
  data?: Record<string, unknown>;
}

function pickString(source: unknown, ...keys: string[]): string | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/** Rút gọn payload thành đúng phần cần lần vết. Không giữ nội dung email. */
export function summarizeWebhookPayload(
  svixId: string,
  payload: ResendWebhookPayload,
): Omit<IEmailWebhookEvent, "_id"> {
  const data = payload.data ?? {};
  const detail = data.bounce ?? data.failed ?? data.suppressed;
  const occurredAtRaw = payload.created_at;
  const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : undefined;

  return {
    svixId,
    type: String(payload.type ?? "unknown"),
    providerMessageId: pickString(data, "email_id"),
    occurredAt:
      occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : undefined,
    reason: pickString(detail, "message", "reason")?.slice(0, 500),
    subType: pickString(detail, "subType", "type"),
    receivedAt: new Date(),
  };
}

export interface ApplyOutcome {
  /** Sự kiện đã được ghi nhận từ trước → không làm gì thêm. */
  duplicate: boolean;
  /** Đã cập nhật được outbox (hoặc xác định là không cần cập nhật). */
  processed: boolean;
}

/**
 * Áp một sự kiện vào outbox.
 *
 * Trả false khi CHƯA áp được (chưa tìm thấy job mang providerMessageId đó) — nghĩa là
 * webhook về nhanh hơn ta kịp ghi id. Sự kiện nằm lại chờ cron reconcile.
 */
export async function applyWebhookEvent(
  event: Pick<
    IEmailWebhookEvent,
    "type" | "providerMessageId" | "reason" | "subType" | "occurredAt"
  >,
): Promise<boolean> {
  // Loại sự kiện không nói gì về số phận bức mail (email.sent, email.opened...) coi như
  // đã xử lý xong — giữ lại chờ reconcile mãi mãi thì chỉ tổ phình bảng.
  const nextStatus = event.type ? STATUS_BY_TYPE[event.type] : undefined;
  if (!nextStatus) return true;
  if (!event.providerMessageId) return true;

  const result = await EmailOutbox.updateOne(
    {
      providerMessageId: event.providerMessageId,
      // Điều kiện thứ bậc nằm NGAY trong filter: hai webhook tới cùng lúc không thể đè
      // nhầm nhau, và không cần đọc-rồi-ghi.
      deliveryStatus: { $in: overridable(nextStatus) },
    },
    {
      $set: {
        deliveryStatus: nextStatus,
        ...(event.reason || event.subType
          ? {
              lastError: {
                code: event.subType ?? event.type,
                message: event.reason,
                at: event.occurredAt ?? new Date(),
              },
            }
          : {}),
      },
    },
  );

  if (result.matchedCount > 0) return true;

  // Không khớp có thể vì (a) job chưa có providerMessageId, hoặc (b) trạng thái hiện tại
  // đã cao hơn nên không được phép ghi đè. Trường hợp (b) là đã xử lý xong.
  const exists = await EmailOutbox.exists({
    providerMessageId: event.providerMessageId,
  });
  return Boolean(exists);
}

async function markProcessed(id: unknown) {
  await EmailWebhookEvent.updateOne(
    { _id: id },
    {
      $set: {
        processedAt: new Date(),
        retentionExpiresAt: new Date(Date.now() + RETENTION_MS),
      },
    },
  );
}

/**
 * Ghi nhận một sự kiện đã verify chữ ký rồi cố áp dụng ngay.
 *
 * Ghi TRƯỚC, áp sau: nếu áp hỏng thì sự kiện vẫn còn để reconcile. Làm ngược lại thì một
 * lỗi giữa chừng là mất luôn tin bounce.
 */
export async function recordWebhookEvent(
  svixId: string,
  payload: ResendWebhookPayload,
): Promise<ApplyOutcome> {
  const summary = summarizeWebhookPayload(svixId, payload);

  let created: IEmailWebhookEvent;
  try {
    created = (await EmailWebhookEvent.create(summary)) as IEmailWebhookEvent;
  } catch (error) {
    // svixId unique: Resend gửi lại sự kiện cũ. Đây là chuyện bình thường, không phải lỗi.
    if ((error as { code?: number })?.code === 11000) {
      return { duplicate: true, processed: true };
    }
    throw error;
  }

  const processed = await applyWebhookEvent(summary);
  if (processed) await markProcessed(created._id);
  return { duplicate: false, processed };
}

export interface ReconcileSummary {
  scanned: number;
  processed: number;
}

/**
 * Quét lại các sự kiện chưa áp được — thường là webhook về trước khi outbox kịp lưu
 * providerMessageId.
 */
export async function reconcileWebhookEvents(
  limit = 100,
): Promise<ReconcileSummary> {
  const pending = await EmailWebhookEvent.find({
    processedAt: { $exists: false },
  })
    .sort({ receivedAt: 1 })
    .limit(limit)
    .lean<IEmailWebhookEvent[]>();

  let processed = 0;
  for (const event of pending) {
    if (!(await applyWebhookEvent(event))) continue;
    await markProcessed(event._id);
    processed += 1;
  }

  return { scanned: pending.length, processed };
}
