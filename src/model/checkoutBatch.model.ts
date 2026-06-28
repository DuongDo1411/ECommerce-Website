import mongoose, { Schema } from "mongoose";

export type CheckoutBatchStatus = "created" | "paid" | "cancelled" | "expired";

export interface ICheckoutBatch {
  _id?: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  // Idempotency key do client sinh; (user, checkoutRequestId) là duy nhất.
  checkoutRequestId: string;
  // ID server sinh, gắn vào Order.checkoutBatchId để gom các đơn cùng lượt checkout.
  checkoutBatchId: string;
  paymentMethod: "cod" | "vnpay";
  orderIds: mongoose.Types.ObjectId[];
  txnRef?: string;
  // finalPayable tại thời điểm tạo, dùng để dựng lại VNPay URL khi double-submit.
  amount: number;
  status: CheckoutBatchStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const checkoutBatchSchema = new mongoose.Schema<ICheckoutBatch>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    checkoutRequestId: {
      type: String,
      required: true,
    },
    checkoutBatchId: {
      type: String,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["cod", "vnpay"],
      required: true,
    },
    orderIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    txnRef: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["created", "paid", "cancelled", "expired"],
      default: "created",
    },
  },
  { timestamps: true },
);

// Chặn double-submit: mỗi (user, checkoutRequestId) chỉ tạo được một batch.
checkoutBatchSchema.index({ user: 1, checkoutRequestId: 1 }, { unique: true });
checkoutBatchSchema.index({ checkoutBatchId: 1 });

const CheckoutBatch =
  mongoose.models?.CheckoutBatch ||
  mongoose.model<ICheckoutBatch>("CheckoutBatch", checkoutBatchSchema);

export default CheckoutBatch;
