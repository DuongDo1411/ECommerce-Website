import mongoose from "mongoose";

/**
 * Sự kiện giao mail do Resend đẩy về (đã verify chữ ký).
 *
 * Vì sao phải lưu lại thay vì xử lý xong rồi bỏ:
 *
 * - Webhook có thể tới TRƯỚC khi ta kịp ghi providerMessageId vào outbox (Resend trả id ở
 *   response, nhưng nếu process chết ngay sau đó thì id chưa kịp lưu). Sự kiện tới sớm
 *   được giữ lại chưa xử lý, cron reconcile nhặt sau — thay vì mất trắng.
 *
 * - Resend gửi lại khi ta trả 5xx. `svixId` unique biến việc xử lý thành idempotent: gửi
 *   lại bao nhiêu lần cũng chỉ áp dụng một lần.
 *
 * Không lưu nội dung email ở đây. Bảng này chỉ để lần vết trạng thái giao, và một bản sao
 * nội dung nữa chỉ làm tăng bề mặt rò rỉ.
 */

export interface IEmailWebhookEvent {
  _id?: mongoose.Types.ObjectId;
  /** Header svix-id. Khoá chống xử lý trùng. */
  svixId: string;
  type: string;
  /** data.email_id — khoá nối về EmailOutbox.providerMessageId. */
  providerMessageId?: string;
  /** created_at của chính sự kiện, không phải lúc ta nhận được. */
  occurredAt?: Date;
  /** Lý do bounce/failed, cắt ngắn. Đủ để điều tra, không phải toàn bộ payload. */
  reason?: string;
  subType?: string;
  receivedAt: Date;
  processedAt?: Date;
  retentionExpiresAt?: Date;
}

const emailWebhookEventSchema = new mongoose.Schema<IEmailWebhookEvent>({
  svixId: { type: String, required: true, unique: true },
  type: { type: String, required: true },
  providerMessageId: { type: String },
  occurredAt: { type: Date },
  reason: { type: String },
  subType: { type: String },
  receivedAt: { type: Date, required: true },
  processedAt: { type: Date },
  retentionExpiresAt: { type: Date },
});

// Đường quét của cron reconcile: sự kiện chưa áp dụng được, cũ nhất trước.
//
// Index ghép chứ không phải partial index: Mongo dịch `$exists: false` thành `$not` và từ
// chối biểu thức đó trong partialFilterExpression. Đặt processedAt lên đầu vẫn cho phép
// lọc đúng nhóm chưa xử lý rồi sort theo receivedAt.
emailWebhookEventSchema.index({ processedAt: 1, receivedAt: 1 });

// Tra ngược khi outbox vừa có providerMessageId.
emailWebhookEventSchema.index({ providerMessageId: 1 });

// TTL chỉ chạy với sự kiện đã xử lý. Sự kiện chưa xử lý không có trường này nên không bao
// giờ bị xoá mất trước khi kịp reconcile.
emailWebhookEventSchema.index(
  { retentionExpiresAt: 1 },
  { expireAfterSeconds: 0 },
);

const EmailWebhookEvent =
  mongoose.models.EmailWebhookEvent ||
  mongoose.model<IEmailWebhookEvent>(
    "EmailWebhookEvent",
    emailWebhookEventSchema,
  );

export default EmailWebhookEvent;
