import mongoose, { Schema } from "mongoose";
import { IUser } from "./user.model";
import { IProduct } from "./product.model";

export type VoucherDiscountType = "fixed" | "percentage" | "freeship";
export type VoucherScope = "all" | "products" | "category";

export interface IVoucher {
  _id?: mongoose.Types.ObjectId;
  code: string;
  vendor?: IUser | mongoose.Types.ObjectId | null;
  title: string;
  description?: string;
  discountType: VoucherDiscountType;
  discountValue: number;
  maxDiscount?: number;
  minSpend: number;
  totalQuota: number;
  usedQuota: number;
  perUserLimit: number;
  scope: VoucherScope;
  applicableProducts?: (IProduct | mongoose.Types.ObjectId)[];
  applicableCategories?: string[];
  collectStartAt?: Date;
  startAt: Date;
  endAt: Date;
  isActive: boolean;
  createdBy: IUser | mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const voucherSchema = new mongoose.Schema<IVoucher>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    discountType: {
      type: String,
      enum: ["fixed", "percentage", "freeship"],
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    maxDiscount: {
      type: Number,
      min: 0,
    },
    minSpend: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalQuota: {
      type: Number,
      required: true,
      min: 1,
    },
    usedQuota: {
      type: Number,
      default: 0,
      min: 0,
    },
    perUserLimit: {
      type: Number,
      default: 1,
      min: 1,
      max: 1,
    },
    scope: {
      type: String,
      enum: ["all", "products", "category"],
      default: "all",
    },
    applicableProducts: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    applicableCategories: {
      type: [String],
      default: [],
    },
    collectStartAt: {
      type: Date,
    },
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

voucherSchema.index({ vendor: 1, isActive: 1, endAt: 1 });
voucherSchema.index({ isActive: 1, endAt: 1 });
// P3: hỗ trợ filter theo slot (vendor+discountType) và sort/manager.
voucherSchema.index({ vendor: 1, discountType: 1, isActive: 1, endAt: 1 });
voucherSchema.index({ vendor: 1, createdAt: -1 });

const Voucher =
  mongoose.models.Voucher || mongoose.model<IVoucher>("Voucher", voucherSchema);

export default Voucher;
