// Worker của transactional outbox: nhận job, giữ lease, gửi, chốt số phận.
//
// Hai lớp chống gửi trùng, cần cả hai:
//   1. CAS + lease  — hai worker (hai lượt cron chồng nhau) không thể cùng claim một job.
//   2. Idempotency-Key = _id của job — nếu lease hết hạn giữa lúc provider đã nhận nhưng
//      ta chưa kịp ghi "accepted", lần gửi lại vẫn chỉ tạo MỘT email thật phía Resend.
//
// Lớp 1 chặn phần lớn; lớp 2 dọn đúng cái khe mà lớp 1 không với tới được: khoảng giữa
// "provider đã nhận" và "ta đã ghi nhận". Bỏ lớp 2 thì một lần deploy đúng lúc là người
// dùng nhận hai bức mail giống hệt.

import mongoose, { type ClientSession } from "mongoose";

import { getMailProvider } from "./provider";
import { withMailRate } from "./rateGate";
import { asMailSendError, type MailMessage } from "./types";
import EmailOutbox, {
  type EmailOutboxState,
  type IEmailOutbox,
  type IEmailOutboxMessage,
} from "@/model/emailOutbox.model";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Lease phải DÀI HƠN timeout gọi provider (mặc định 10s), nếu không một worker khác sẽ
 * claim lại job trong lúc request đầu vẫn đang bay.
 */
const LEASE_MS = 2 * MINUTE_MS;

/** Đủ dài để vượt qua một sự cố ngắn, đủ ngắn để không giam mail cả ngày. */
const BACKOFF_MINUTES = [1, 2, 4, 8, 16, 32, 60, 60];
const JITTER_RATIO = 0.15;
const DEFAULT_MAX_TRANSIENT = 8;

const RETENTION_MS = 30 * DAY_MS;

export type FlushOutcome =
  | "accepted"
  | "retry"
  | "dead"
  | "expired"
  | "skipped";

export interface FlushResult {
  outcome: FlushOutcome;
  /** Lỗi cấu hình/quota: các job còn lại cũng sẽ hỏng y hệt, dừng lượt quét cho đỡ phí. */
  stopBatch: boolean;
}

export interface FlushSummary {
  scanned: number;
  accepted: number;
  retried: number;
  dead: number;
  expired: number;
  skipped: number;
  stoppedEarly: boolean;
}

function backoffMs(transientAttempts: number): number {
  const index = Math.min(
    Math.max(transientAttempts - 1, 0),
    BACKOFF_MINUTES.length - 1,
  );
  const base = BACKOFF_MINUTES[index] * MINUTE_MS;
  // Jitter để nhiều job hỏng cùng lúc không cùng nhau dội lại vào provider.
  const jitter = base * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

function terminalUnset(doc: IEmailOutbox): Record<string, string> {
  const unset: Record<string, string> = { leaseToken: "", lockedUntil: "" };
  // Link reset mật khẩu là bearer token: ai đọc được outbox là đổi được mật khẩu. Job đã
  // chốt thì payload không còn tác dụng gì ngoài việc nằm đó chờ rò rỉ.
  if (doc.scrubOnTerminal) {
    unset.rawMessage = "";
    unset.materializedMessage = "";
  }
  return unset;
}

function terminalPatch(
  doc: IEmailOutbox,
  state: EmailOutboxState,
  extraSet: Record<string, unknown> = {},
): mongoose.UpdateQuery<IEmailOutbox> {
  return {
    $set: {
      state,
      retentionExpiresAt: new Date(Date.now() + RETENTION_MS),
      ...extraSet,
    },
    $unset: terminalUnset(doc),
  };
}

/**
 * Giành quyền xử lý một job. Ai findOneAndUpdate trước thì thắng; người thua nhận null.
 * `attempts` tăng NGAY lúc claim chứ không đợi biết kết quả — một job làm crash worker vẫn
 * phải tiêu attempt, nếu không nó lặp vô hạn và kéo theo cả hàng đợi.
 */
async function claim(id: unknown): Promise<IEmailOutbox | null> {
  const now = new Date();
  const leaseToken = new mongoose.Types.ObjectId().toString();

  return EmailOutbox.findOneAndUpdate(
    {
      _id: id,
      state: "pending",
      nextAttemptAt: { $lte: now },
      $and: [
        {
          $or: [
            { notBefore: { $exists: false } },
            { notBefore: { $lte: now } },
          ],
        },
        {
          $or: [
            { lockedUntil: { $exists: false } },
            { lockedUntil: { $lte: now } },
          ],
        },
      ],
    },
    {
      $inc: { attempts: 1 },
      $set: { leaseToken, lockedUntil: new Date(now.getTime() + LEASE_MS) },
    },
    { returnDocument: "after" },
  ).lean<IEmailOutbox>();
}

/**
 * Render nội dung ĐÚNG MỘT LẦN rồi ghim lại. Retry phải gửi y hệt payload cũ: Resend từ
 * chối cùng Idempotency-Key với nội dung khác, và người nhận cũng không nên thấy mail đổi
 * nội dung giữa các lần thử.
 *
 * Trả null nghĩa là không có gì để gửi (thiếu người nhận, case đã xoá) — đó là lỗi vĩnh
 * viễn, không phải lỗi nhất thời.
 */
async function materialize(
  doc: IEmailOutbox,
): Promise<IEmailOutboxMessage | null> {
  if (doc.materializedMessage) return doc.materializedMessage;

  let message: MailMessage | null = null;
  if (doc.kind === "raw") {
    message = doc.rawMessage ?? null;
  } else if (doc.returnIntent) {
    // Import động để cắt vòng phụ thuộc: returns/mail.ts gọi ngược lại enqueue ở đây.
    const { renderReturnMail } = await import("@/lib/returns/mail");
    message = await renderReturnMail(doc.returnIntent);
  }
  if (!message) return null;

  const stored: IEmailOutboxMessage = {
    to: message.to,
    subject: message.subject,
    html: message.html,
    ...(message.text ? { text: message.text } : {}),
    ...(message.fromName ? { fromName: message.fromName } : {}),
  };

  await EmailOutbox.updateOne(
    { _id: doc._id, state: "pending", leaseToken: doc.leaseToken },
    { $set: { materializedMessage: stored } },
  );
  return stored;
}

/** Ghi kết quả, luôn kèm leaseToken để một worker cũ không đè lên lượt claim mới hơn. */
function settle(doc: IEmailOutbox, update: mongoose.UpdateQuery<IEmailOutbox>) {
  return EmailOutbox.updateOne(
    { _id: doc._id, state: "pending", leaseToken: doc.leaseToken },
    update,
  );
}

async function recordTransientFailure(
  doc: IEmailOutbox,
  message: string,
  code: string,
  extra?: { status?: number; retryAfterMs?: number },
): Promise<FlushResult> {
  const transientAttempts = (doc.transientAttempts ?? 0) + 1;
  const lastError = {
    code,
    status: extra?.status,
    message: message.slice(0, 500),
    at: new Date(),
  };

  if (transientAttempts >= (doc.maxTransientAttempts ?? DEFAULT_MAX_TRANSIENT)) {
    await settle(doc, terminalPatch(doc, "dead", { lastError, transientAttempts }));
    return { outcome: "dead", stopBatch: false };
  }

  await settle(doc, {
    $set: {
      lastError,
      transientAttempts,
      nextAttemptAt: new Date(
        Date.now() + (extra?.retryAfterMs ?? backoffMs(transientAttempts)),
      ),
    },
    $unset: { leaseToken: "", lockedUntil: "" },
  });
  return { outcome: "retry", stopBatch: false };
}

export async function flushOne(id: unknown): Promise<FlushResult> {
  const doc = await claim(id);
  if (!doc) return { outcome: "skipped", stopBatch: false };

  // Mail hết hạn ý nghĩa (link reset đã chết) thì đừng gửi. Gửi một link không dùng được
  // còn tệ hơn không gửi gì.
  if (doc.notAfter && doc.notAfter.getTime() <= Date.now()) {
    await settle(doc, terminalPatch(doc, "expired"));
    return { outcome: "expired", stopBatch: false };
  }

  let rendered: IEmailOutboxMessage | null;
  try {
    rendered = await materialize(doc);
  } catch (error) {
    // Lỗi khi đọc dữ liệu để render (DB trục trặc) là nhất thời, khác hẳn "không có gì để gửi".
    const failure = asMailSendError(error);
    return recordTransientFailure(doc, failure.message, failure.code);
  }

  if (!rendered) {
    await settle(
      doc,
      terminalPatch(doc, "dead", {
        lastError: {
          code: "render_empty",
          message:
            "Không dựng được nội dung mail (thiếu người nhận hoặc dữ liệu đã xoá)",
          at: new Date(),
        },
      }),
    );
    return { outcome: "dead", stopBatch: false };
  }

  const payload = rendered;
  const provider = getMailProvider();

  try {
    const result = await withMailRate("normal", () =>
      provider.send(payload, {
        // Cùng một job luôn dùng cùng một khoá — đây là điều làm nên tính idempotent.
        idempotencyKey: String(doc._id),
        signal: AbortSignal.timeout(LEASE_MS),
        priority: "normal",
      }),
    );

    await settle(doc, {
      $set: {
        state: "accepted",
        acceptedAt: new Date(),
        provider: provider.name,
        providerMessageId: result.providerMessageId,
        retentionExpiresAt: new Date(Date.now() + RETENTION_MS),
      },
      $unset: terminalUnset(doc),
    });
    return { outcome: "accepted", stopBatch: false };
  } catch (error) {
    const failure = asMailSendError(error);
    const lastError = {
      code: failure.code,
      status: failure.status,
      message: failure.message.slice(0, 500),
      at: new Date(),
    };

    // Hỏng ở chính bức mail: gửi lại vẫn hỏng y hệt.
    if (failure.scope === "message") {
      await settle(doc, terminalPatch(doc, "dead", { lastError }));
      return { outcome: "dead", stopBatch: false };
    }

    // Hỏng ở cấu hình/hạn mức: bức mail vô tội. Giữ pending, hẹn theo lời provider, và
    // KHÔNG tính vào transientAttempts — nếu tính thì một sự cố kéo dài sẽ giết sạch job.
    if (failure.scope === "provider") {
      await settle(doc, {
        $set: {
          lastError,
          nextAttemptAt: new Date(
            Date.now() + (failure.retryAfterMs ?? 15 * MINUTE_MS),
          ),
        },
        $unset: { leaseToken: "", lockedUntil: "" },
      });
      return { outcome: "retry", stopBatch: true };
    }

    return recordTransientFailure(doc, lastError.message, failure.code, {
      status: failure.status,
      retryAfterMs: failure.retryAfterMs,
    });
  }
}

/**
 * Quét một lô job đến hạn. Xử lý TUẦN TỰ để hạn mức tốc độ có ý nghĩa — bắn song song thì
 * rate gate chỉ còn là hàng đợi chứ không còn điều tiết được gì.
 */
export async function flushEmailOutbox(limit = 20): Promise<FlushSummary> {
  const now = new Date();
  const docs = await EmailOutbox.find({
    state: "pending",
    nextAttemptAt: { $lte: now },
    $or: [{ notBefore: { $exists: false } }, { notBefore: { $lte: now } }],
  })
    .sort({ nextAttemptAt: 1 })
    .select("_id")
    .limit(limit)
    .lean<Array<{ _id: mongoose.Types.ObjectId }>>();

  const summary: FlushSummary = {
    scanned: docs.length,
    accepted: 0,
    retried: 0,
    dead: 0,
    expired: 0,
    skipped: 0,
    stoppedEarly: false,
  };

  for (const doc of docs) {
    const { outcome, stopBatch } = await flushOne(doc._id);
    if (outcome === "accepted") summary.accepted += 1;
    else if (outcome === "retry") summary.retried += 1;
    else if (outcome === "dead") summary.dead += 1;
    else if (outcome === "expired") summary.expired += 1;
    else summary.skipped += 1;

    if (stopBatch) {
      summary.stoppedEarly = true;
      break;
    }
  }

  return summary;
}

export interface EnqueueMailInput {
  message: MailMessage;
  dedupeKey?: string;
  supersessionKey?: string;
  notBefore?: Date;
  notAfter?: Date;
  scrubOnTerminal?: boolean;
  maxTransientAttempts?: number;
}

/**
 * Ghi một bức mail cụ thể vào outbox.
 *
 * NÉM lỗi nếu ghi hỏng — đúng như thiết kế: hàm này chạy trong transaction cùng dữ liệu
 * nghiệp vụ, nên ghi hỏng phải kéo cả transaction rollback. Nuốt lỗi ở đây nghĩa là nghiệp
 * vụ commit còn thông báo bốc hơi, đúng cái bệnh mà outbox sinh ra để chữa.
 */
export async function enqueueMail(
  input: EnqueueMailInput,
  options?: { session?: ClientSession },
): Promise<mongoose.Types.ObjectId> {
  const base = {
    kind: "raw" as const,
    rawMessage: input.message,
    state: "pending" as const,
    deliveryStatus: "unknown" as const,
    attempts: 0,
    transientAttempts: 0,
    maxTransientAttempts: input.maxTransientAttempts ?? DEFAULT_MAX_TRANSIENT,
    nextAttemptAt: new Date(),
    scrubOnTerminal: input.scrubOnTerminal ?? false,
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.supersessionKey
      ? { supersessionKey: input.supersessionKey }
      : {}),
    ...(input.notBefore ? { notBefore: input.notBefore } : {}),
    ...(input.notAfter ? { notAfter: input.notAfter } : {}),
  };

  if (input.dedupeKey) {
    // Upsert thay vì create: gặp khoá trùng thì lấy lại job cũ, không để lỗi duplicate key
    // làm hỏng transaction đang mở.
    const doc = await EmailOutbox.findOneAndUpdate(
      { dedupeKey: input.dedupeKey },
      { $setOnInsert: base },
      { upsert: true, returnDocument: "after", session: options?.session },
    ).lean<IEmailOutbox>();
    return doc!._id!;
  }

  const [doc] = await EmailOutbox.create([base], { session: options?.session });
  return doc._id!;
}

export interface EnqueueReturnMailInput {
  returnRequestId: mongoose.Types.ObjectId;
  event: string;
  note?: string;
  statusAtEvent?: string;
  historyEntryId?: mongoose.Types.ObjectId;
  dedupeKey?: string;
  notBefore?: Date;
}

/**
 * Ghi Ý ĐỊNH gửi mail cho một sự kiện hoàn/trả, chưa render nội dung.
 *
 * Không render ngay vì lúc này đang ở trong transaction: đọc thêm dữ liệu để dựng HTML sẽ
 * kéo dài transaction một cách vô nghĩa, mà dữ liệu cần đọc (mã vận đơn chẳng hạn) có khi
 * còn chưa tồn tại.
 */
export async function enqueueReturnMailIntent(
  input: EnqueueReturnMailInput,
  options?: { session?: ClientSession },
): Promise<mongoose.Types.ObjectId> {
  const base = {
    kind: "return_event" as const,
    returnIntent: {
      returnRequestId: input.returnRequestId,
      event: input.event,
      ...(input.note ? { note: input.note } : {}),
      ...(input.statusAtEvent ? { statusAtEvent: input.statusAtEvent } : {}),
      ...(input.historyEntryId ? { historyEntryId: input.historyEntryId } : {}),
    },
    state: "pending" as const,
    deliveryStatus: "unknown" as const,
    attempts: 0,
    transientAttempts: 0,
    maxTransientAttempts: DEFAULT_MAX_TRANSIENT,
    nextAttemptAt: new Date(),
    scrubOnTerminal: false,
    ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    ...(input.notBefore ? { notBefore: input.notBefore } : {}),
  };

  if (input.dedupeKey) {
    const doc = await EmailOutbox.findOneAndUpdate(
      { dedupeKey: input.dedupeKey },
      { $setOnInsert: base },
      { upsert: true, returnDocument: "after", session: options?.session },
    ).lean<IEmailOutbox>();
    return doc!._id!;
  }

  const [doc] = await EmailOutbox.create([base], { session: options?.session });
  return doc._id!;
}

/**
 * Huỷ các job cũ bị một yêu cầu mới thay thế (vd: người dùng bấm "quên mật khẩu" lần hai).
 * Link cũ đã mất hiệu lực rồi thì gửi nó đi chỉ tổ làm người nhận bối rối.
 */
export async function cancelSupersededMails(
  supersessionKey: string,
  options?: { session?: ClientSession },
): Promise<number> {
  const retentionExpiresAt = new Date(Date.now() + RETENTION_MS);
  const session = options?.session;

  const scrubbed = await EmailOutbox.updateMany(
    { supersessionKey, state: "pending", scrubOnTerminal: true },
    {
      $set: { state: "cancelled", retentionExpiresAt },
      $unset: {
        rawMessage: "",
        materializedMessage: "",
        leaseToken: "",
        lockedUntil: "",
      },
    },
    { session },
  );

  const plain = await EmailOutbox.updateMany(
    { supersessionKey, state: "pending", scrubOnTerminal: { $ne: true } },
    {
      $set: { state: "cancelled", retentionExpiresAt },
      $unset: { leaseToken: "", lockedUntil: "" },
    },
    { session },
  );

  return (scrubbed.modifiedCount ?? 0) + (plain.modifiedCount ?? 0);
}
