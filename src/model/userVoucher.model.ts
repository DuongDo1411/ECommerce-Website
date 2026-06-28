import mongoose, { Schema } from "mongoose";
import { IUser } from "./user.model";
import "./voucher.model";
import type { IVoucher } from "./voucher.model";

export type UserVoucherStatus = "collected" | "reserved" | "used" | "expired";

export interface IUserVoucher {
  _id?: mongoose.Types.ObjectId;
  user: IUser | mongoose.Types.ObjectId;
  voucher: IVoucher | mongoose.Types.ObjectId;
  status: UserVoucherStatus;
  checkoutBatchId?: string;
  txnRef?: string;
  collectedAt: Date;
  reservedAt?: Date;
  usedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const userVoucherSchema = new mongoose.Schema<IUserVoucher>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    voucher: {
      type: Schema.Types.ObjectId,
      ref: "Voucher",
      required: true,
    },
    status: {
      type: String,
      enum: ["collected", "reserved", "used", "expired"],
      default: "collected",
    },
    checkoutBatchId: {
      type: String,
    },
    txnRef: {
      type: String,
    },
    collectedAt: {
      type: Date,
      default: Date.now,
    },
    reservedAt: {
      type: Date,
    },
    usedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

userVoucherSchema.index({ user: 1, voucher: 1 }, { unique: true });
userVoucherSchema.index({ user: 1, status: 1 });
userVoucherSchema.index({ checkoutBatchId: 1 });
userVoucherSchema.index({ voucher: 1, status: 1 });

const UserVoucher =
  mongoose.models.UserVoucher ||
  mongoose.model<IUserVoucher>("UserVoucher", userVoucherSchema);

export default UserVoucher;
