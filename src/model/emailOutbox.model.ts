import mongoose from "mongoose";

/**
 * Transactional outbox cho email.
 *
 * Ý tưởng: mail nghiệp vụ được GHI cùng transaction với dữ liệu nghiệp vụ, rồi mới gửi ở
 * bước sau. Nhờ vậy hai thứ không bao giờ lệch nhau — không có chuyện case hoàn trả đã
 * chuyển trạng thái mà thông báo bốc hơi, cũng không có chuyện gửi mail cho một quyết định
 * cuối cùng bị rollback.
 *
 * Vài lựa chọn đáng giải thích:
 *
 * - KHÔNG có state "sending". Việc đang gửi được thể hiện bằng cặp leaseToken + lockedUntil.
 *   Process chết giữa chừng thì lease tự hết hạn và cron nhặt lại; không cần sweep dọn
 *   record kẹt ở trạng thái trung gian.
 *
 * - `attempts` đếm MỌI lần claim, `transientAttempts` chỉ đếm lỗi nhất thời. Chỉ cái thứ hai
 *   mới đẩy job sang "dead". Nếu gộp làm một thì một sự cố cấu hình kéo dài vài giờ (API key
 *   sai, hết quota) sẽ giết sạch mọi mail đang chờ — trong khi bản thân chúng không có lỗi gì.
 *
 * - `materializedMessage` render ĐÚNG MỘT LẦN trước lần gửi đầu. Retry phải gửi lại y hệt
 *   payload cũ: cùng một Idempotency-Key mà nội dung khác nhau thì Resend từ chối, và người
 *   nhận cũng không nên thấy nội dung đổi giữa các lần thử.
 *
 * - `retentionExpiresAt` CHỈ set khi job đã chốt số phận. Đặt TTL ngay lúc tạo là tự đặt bom
 *   hẹn giờ: một job kẹt lâu hơn TTL sẽ bị Mongo xoá trước khi kịp gửi.
 */

export type EmailOutboxKind = "raw" | "return_event";

export type EmailOutboxState =
  | "pending"
  | "accepted"
  | "dead"
  | "expired"
  | "cancelled";

/**
 * "accepted" chỉ có nghĩa Resend đã NHẬN, chưa phải đã giao tới hộp thư. Trạng thái giao
 * thật chỉ biết được qua webhook — đó là lý do hai trường này tách nhau.
 */
export type EmailDeliveryStatus =
  | "unknown"
  | "delayed"
  | "delivered"
  | "failed"
  | "bounced"
  | "complained"
  | "suppressed";

export interface IEmailOutboxMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
}

/** Ý định gửi mail cho một sự kiện hoàn/trả; nội dung được render lúc sắp gửi. */
export interface IReturnMailIntent {
  returnRequestId: mongoose.Types.ObjectId;
  event: string;
  note?: string;
  statusAtEvent?: string;
  /** Trỏ tới đúng dòng history đã sinh ra ý định này — nền tảng của dedupeKey. */
  historyEntryId?: mongoose.Types.ObjectId;
}

export interface IEmailOutboxError {
  code?: string;
  status?: number;
  message?: string;
  at?: Date;
}

export interface IEmailOutbox {
  _id?: mongoose.Types.ObjectId;
  kind: EmailOutboxKind;
  rawMessage?: IEmailOutboxMessage;
  returnIntent?: IReturnMailIntent;
  materializedMessage?: IEmailOutboxMessage;

  state: EmailOutboxState;
  deliveryStatus: EmailDeliveryStatus;

  dedupeKey?: string;
  /** Yêu cầu mới làm mất hiệu lực các job cũ cùng khoá (vd: reset mật khẩu). */
  supersessionKey?: string;

  attempts: number;
  transientAttempts: number;
  maxTransientAttempts: number;

  nextAttemptAt: Date;
  lockedUntil?: Date;
  leaseToken?: string;

  /** Chưa tới giờ thì đừng gửi (vd: chờ GHN cấp mã vận đơn). */
  notBefore?: Date;
  /** Quá giờ này thì mail vô nghĩa (vd: token reset đã hết hạn) → chuyển "expired". */
  notAfter?: Date;

  provider?: string;
  providerMessageId?: string;
  acceptedAt?: Date;

  lastError?: IEmailOutboxError;

  /** Nội dung chứa bí mật (link reset) → xoá payload ngay khi job chốt số phận. */
  scrubOnTerminal: boolean;

  retentionExpiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const messageSchema = new mongoose.Schema<IEmailOutboxMessage>(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },
    html: { type: String, required: true },
    text: { type: String },
    fromName: { type: String },
  },
  { _id: false },
);

const returnIntentSchema = new mongoose.Schema<IReturnMailIntent>(
  {
    returnRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReturnRequest",
      required: true,
    },
    event: { type: String, required: true },
    note: { type: String },
    statusAtEvent: { type: String },
    historyEntryId: { type: mongoose.Schema.Types.ObjectId },
  },
  { _id: false },
);

const lastErrorSchema = new mongoose.Schema<IEmailOutboxError>(
  {
    code: { type: String },
    status: { type: Number },
    message: { type: String },
    at: { type: Date },
  },
  { _id: false },
);

const emailOutboxSchema = new mongoose.Schema<IEmailOutbox>(
  {
    kind: { type: String, enum: ["raw", "return_event"], required: true },
    rawMessage: { type: messageSchema },
    returnIntent: { type: returnIntentSchema },
    materializedMessage: { type: messageSchema },

    state: {
      type: String,
      enum: ["pending", "accepted", "dead", "expired", "cancelled"],
      default: "pending",
      required: true,
    },
    deliveryStatus: {
      type: String,
      enum: [
        "unknown",
        "delayed",
        "delivered",
        "failed",
        "bounced",
        "complained",
        "suppressed",
      ],
      default: "unknown",
      required: true,
    },

    dedupeKey: { type: String },
    supersessionKey: { type: String },

    attempts: { type: Number, default: 0 },
    transientAttempts: { type: Number, default: 0 },
    maxTransientAttempts: { type: Number, default: 8 },

    nextAttemptAt: { type: Date, required: true },
    lockedUntil: { type: Date },
    leaseToken: { type: String },

    notBefore: { type: Date },
    notAfter: { type: Date },

    provider: { type: String },
    providerMessageId: { type: String },
    acceptedAt: { type: Date },

    lastError: { type: lastErrorSchema },

    scrubOnTerminal: { type: Boolean, default: false },
    retentionExpiresAt: { type: Date },
  },
  { timestamps: true },
);

// Đường quét của worker: lấy job đến hạn, cũ nhất trước.
emailOutboxSchema.index({ state: 1, nextAttemptAt: 1, notBefore: 1 });

// Chống tạo trùng. Partial để các job không đặt dedupeKey không đụng nhau ở khoá null.
emailOutboxSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } },
);

// Tìm nhanh các job cũ cần huỷ khi có yêu cầu mới thay thế.
emailOutboxSchema.index({ supersessionKey: 1, state: 1 });

// Webhook đến chỉ có message id của provider; phải tra ngược về job.
emailOutboxSchema.index(
  { providerMessageId: 1 },
  {
    partialFilterExpression: { providerMessageId: { $type: "string" } },
  },
);

// TTL dọn record đã chốt. Job còn pending không có trường này nên không bao giờ bị xoá.
emailOutboxSchema.index({ retentionExpiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailOutbox =
  mongoose.models.EmailOutbox ||
  mongoose.model<IEmailOutbox>("EmailOutbox", emailOutboxSchema);

export default EmailOutbox;
