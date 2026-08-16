import mongoose from "mongoose";

/**
 * Một lượt đăng ký trực tiếp bằng email/mật khẩu đang chờ chủ hộp thư xác nhận.
 *
 * Tài khoản CHƯA tồn tại khi bản ghi này được tạo: `users` chỉ nhận document mới sau khi
 * token trong liên kết kích hoạt được claim thành công. Nhờ vậy mọi hàng trong `users` đều
 * là tài khoản đã xác minh email, và không cần thêm cờ trạng thái nào lên user schema —
 * tài khoản cũ vì thế tiếp tục đăng nhập bình thường, không phải backfill.
 *
 * Chỉ lưu HMAC digest của token, không bao giờ lưu token gốc; token gốc chỉ tồn tại trong
 * liên kết đã gửi đi, cùng nguyên tắc với passwordResetToken.model.ts.
 *
 * Google OAuth không đi qua đây: Google đã chứng minh quyền sở hữu email nên tạo user ngay.
 */
export interface IPendingRegistration {
  _id?: mongoose.Types.ObjectId;
  name: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  tokenHash: string;
  expiresAt: Date;
  /** Đăng ký từ luồng mở gian hàng; quyết định nơi điều hướng sau khi kích hoạt. */
  intent?: "vendor";
  createdAt?: Date;
  updatedAt?: Date;
}

const pendingRegistrationSchema = new mongoose.Schema<IPendingRegistration>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    emailNormalized: { type: String, required: true, unique: true },
    // select: false để một lượt đọc vô ý không kéo theo hash mật khẩu; route kích hoạt
    // phải xin tường minh bằng .select("+passwordHash").
    passwordHash: { type: String, required: true, select: false },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    intent: { type: String, enum: ["vendor"] },
  },
  { timestamps: true },
);

// TTL chỉ dọn rác nền, không phải cơ chế kiểm hạn: MongoDB xoá trễ tới một phút, nên mọi
// route vẫn phải tự đối chiếu `expiresAt` thay vì tin rằng bản ghi hết hạn đã biến mất.
pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingRegistration =
  mongoose.models.PendingRegistration ||
  mongoose.model<IPendingRegistration>(
    "PendingRegistration",
    pendingRegistrationSchema,
  );

export default PendingRegistration;
