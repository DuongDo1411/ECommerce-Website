import mongoose from "mongoose";
import { IProduct } from "./product.model";
import { IUser } from "./user.model";

export interface IOrder {
  products: {
    product: IProduct;
    quantity: number;
    price: number;
    size?: string;
  }[];

  buyer: IUser;
  productVendor: IUser;

  productsTotal: number;
  deliveryCharge: number;
  serviceCharge: number;
  totalAmount: number;
  checkoutBatchId?: string;
  originalTotal?: number;
  shopDiscount?: number;
  platformDiscount?: number;
  freeshipDiscount?: number;
  totalDiscount?: number;
  appliedVouchers?: {
    voucher: mongoose.Types.ObjectId;
    code: string;
    slot: "shop" | "platform" | "freeship";
    discountType: "fixed" | "percentage" | "freeship";
    amount: number;
  }[];

  paymentMethod: "cod" | "vnpay";
  isPaid: boolean;

  orderStatus:
    | "pending"
    | "confirmed"
    | "shipped"
    | "delivered"
    | "returned"
    | "cancelled";

  cancelledAt?: Date;
  // ✅ NEW: RETURNED AMOUNT
  returnedAmount?: number;
  refundStatus?: "none" | "pending" | "processed" | "failed";

  address: {
    name: string;
    phone: string;
    address: string;
    city: string;
    pincode: string;
    // GHN-structured (post-2025 admin data)
    addressDetail?: string;
    wardCode?: string;
    wardName?: string;
    districtId?: number;
    districtName?: string;
    provinceId?: number;
    provinceName?: string;
  };

  ghn?: {
    orderCode?: string;
    sortCode?: string;
    serviceId?: number;
    fee?: number;
    expectedDeliveryTime?: Date;
    status?: string;
    statusLog?: { status: string; time: Date }[];
    visibleToCustomer?: boolean;
  };

  paymentDetails?: {
    vnpayTxnRef?: string;
    vnpayTransactionNo?: string;
    vnpayBankCode?: string;
    vnpayResponseCode?: string;
    vnpayPayDate?: string;
    vnpayOrderInfo?: string;
    vnpayAmount?: number;
  };

  deliveryDate?: Date;
  deliveryOtp?: string;

  otpExpiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new mongoose.Schema<IOrder>(
  {
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        price: {
          type: Number,
          required: true,
        },
        size: {
          type: String,
        },
      },
    ],

    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    productVendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    productsTotal: {
      type: Number,
      required: true,
    },

    deliveryCharge: {
      type: Number,
      default: 0,
    },

    serviceCharge: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    checkoutBatchId: {
      type: String,
      index: true,
    },

    originalTotal: {
      type: Number,
      default: 0,
    },

    shopDiscount: {
      type: Number,
      default: 0,
    },

    platformDiscount: {
      type: Number,
      default: 0,
    },

    freeshipDiscount: {
      type: Number,
      default: 0,
    },

    totalDiscount: {
      type: Number,
      default: 0,
    },

    appliedVouchers: [
      {
        voucher: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Voucher",
        },
        code: String,
        slot: {
          type: String,
          enum: ["shop", "platform", "freeship"],
        },
        discountType: {
          type: String,
          enum: ["fixed", "percentage", "freeship"],
        },
        amount: {
          type: Number,
          default: 0,
        },
      },
    ],

    paymentMethod: {
      type: String,
      enum: ["cod", "vnpay"],
      required: true,
    },

    isPaid: {
      type: Boolean,
      default: false,
    },

    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "returned",
        "cancelled",
      ],
      default: "pending",
    },

    cancelledAt: {
      type: Date,
    },

    returnedAmount: {
      type: Number,
      default: 0,
    },

    refundStatus: {
      type: String,
      enum: ["none", "pending", "processed", "failed"],
      default: "none",
    },

    address: {
      name: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      address: {
        type: String,
        required: true,
      },
      city: {
        type: String,
        required: true,
      },
      pincode: {
        type: String,
        default: "",
      },
      addressDetail: { type: String },
      wardCode: { type: String },
      wardName: { type: String },
      districtId: { type: Number },
      districtName: { type: String },
      provinceId: { type: Number },
      provinceName: { type: String },
    },

    ghn: {
      orderCode: { type: String },
      sortCode: { type: String },
      serviceId: { type: Number },
      fee: { type: Number },
      expectedDeliveryTime: { type: Date },
      status: { type: String },
      statusLog: [
        {
          status: { type: String },
          time: { type: Date },
        },
      ],
      visibleToCustomer: { type: Boolean, default: false },
    },

    paymentDetails: {
      vnpayTxnRef: String,
      vnpayTransactionNo: String,
      vnpayBankCode: String,
      vnpayResponseCode: String,
      vnpayPayDate: String,
      vnpayOrderInfo: String,
      vnpayAmount: Number,
    },

    deliveryDate: {
      type: Date,
    },

    deliveryOtp: {
      type: String,
    },

    otpExpiresAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

// Phục vụ thống kê voucher (settled/pending discount theo voucher).
orderSchema.index({ "appliedVouchers.voucher": 1, orderStatus: 1, createdAt: -1 });

const Order =
  mongoose.models?.Order || mongoose.model<IOrder>("Order", orderSchema);

export default Order;
