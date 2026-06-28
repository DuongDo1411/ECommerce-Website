import mongoose from "mongoose";

export interface IUser {
  _id?: mongoose.Types.ObjectId;
  name?: string;
  password?: string;
  email?: string;
  phone?: string;
  image?: string;
  gender?: "male" | "female";
  hasPassword?: boolean;
  role: "user" | "vendor" | "admin";

  // delivery addresses (GHN-structured)
  addresses?: {
    _id?: mongoose.Types.ObjectId;
    label?: string;
    fullName: string;
    phone: string;
    provinceId: number;
    provinceName: string;
    districtId: number;
    districtName: string;
    wardCode: string;
    wardName: string;
    addressDetail: string;
    isDefault: boolean;
  }[];

  //vendor
  shopName?: string;
  shopAddress?: string;
  shopBackground?: string;
  shopAddressDetail?: {
    address: string;
    wardCode: string;
    wardName: string;
    districtId: number;
    districtName: string;
    provinceId: number;
    provinceName: string;
  };
  taxNumber?: string;
  isApproved?: boolean;
  verificationStatus?: "pending" | "approved" | "rejected";
  requestedAt?: Date;
  approvedAt?: Date;
  rejectedReason?: string;

  vendorProducts?: mongoose.Types.ObjectId[];
  orders?: mongoose.Types.ObjectId[];

  vendorReviews?: {
    _id?: mongoose.Types.ObjectId;
    user: IUser;
    rating: number;
    comment?: string;
    createdAt?: Date;
  }[];

  cart?: {
    product: mongoose.Types.ObjectId;
    quantity: number;
    size?: string;
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
    gender: {
      type: String,
      enum: ["male", "female"],
    },
    role: {
      type: String,
      enum: ["user", "vendor", "admin"],
      default: "user",
    },
    addresses: [
      {
        label: { type: String },
        fullName: { type: String, required: true },
        phone: { type: String, required: true },
        provinceId: { type: Number, required: true },
        provinceName: { type: String, required: true },
        districtId: { type: Number, required: true },
        districtName: { type: String, required: true },
        wardCode: { type: String, required: true },
        wardName: { type: String, required: true },
        addressDetail: { type: String, required: true },
        isDefault: { type: Boolean, default: false },
      },
    ],
    shopName: {
      type: String,
    },
    shopAddress: {
      type: String,
    },
    shopBackground: {
      type: String,
    },
    shopAddressDetail: {
      address: { type: String },
      wardCode: { type: String },
      wardName: { type: String },
      districtId: { type: Number },
      districtName: { type: String },
      provinceId: { type: Number },
      provinceName: { type: String },
    },
    taxNumber: {
      type: String,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
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
    vendorReviews: {
      type: [
        {
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
          },
          rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
          },
          comment: {
            type: String,
            trim: true,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
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
        size: {
          type: String,
        },
      },
    ],
  },
  { timestamps: true },
);

const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);

export default User;
