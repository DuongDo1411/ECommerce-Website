import { timeStamp } from "console";
import mongoose from "mongoose";

interface IUser {
  id?: mongoose.Types.ObjectId;
  name?: string;
  password?: string;
  email?: string;
  phone?: string;
  image?: string;
  role: "user" | "vendor" | "admin";

  //vendor
  shopName?: string;
  shopAddress?: string;
  taxNumber?: string;
  isAproved?: boolean;
  veritificationStatus?: "pending" | "approved" | "rejected";
  requestedAt?: Date;
  approvedAt?: Date;
  rejectedReason?: string;

  vendorProducts?: mongoose.Types.ObjectId[];
  orders?: mongoose.Types.ObjectId;

  cart?: {
    product: mongoose.Types.ObjectId;
    quantity: number;
  }[];

  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
    },
    image: {
      type: String,
    },
    phone: {
      type: String,
    },
    role: {
      type: String,
      enum: ["user", "vendor", "admin"],
      default: "user",
    },
    shopName: {
      type: String,
    },
    shopAddress: {
      type: String,
    },
    taxNumber: {
      type: String,
    },
    isAproved: {
      type: Boolean,
      default: false,
    },
    veritificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedAt: {
      type: Date,
    },
    requestedAt: {
      type: Date,
    },
    rejectedReason: {
      type: String,
    },
    vendorProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    cart: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: {
          type: Number,
          default: 1,
        },
      },
    ],
  },
  { timestamps: true },
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;
