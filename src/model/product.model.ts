import mongoose from "mongoose";
import { IUser } from "./user.model";
export interface IProduct {
  _id?: mongoose.Types.ObjectId;
  title: string;
  description: string;
  price: number;
  stock: number;
  isStockAvailable?: boolean;

  vendor: IUser;

  image1: string;
  image2: string;
  image3: string;
  image4: string;

  category: string;

  isWearable: boolean;
  size?: string[];

  verificationStatus?: "pending" | "approved" | "rejected";
  requestedAt?: Date;
  approvedAt?: Date;
  rejectedReason?: string;

  isActive?: boolean;

  replacementDays?: number;
  freeDelivery?: boolean;
  warranty?: string;
  payOnDelivery?: boolean;

  detailsPoints: string[];

  reviews?: {
    user: IUser;
    rating: number;
    comment?: string;
    image?: string;
    createdAt?: Date;
  }[];

  createdAt?: Date;
  updatedAt?: Date;
}

const productSchema = new mongoose.Schema<IProduct>(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
    },
    isStockAvailable: {
      type: Boolean,
      default: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    image1: {
      type: String,
      required: true,
    },
    image2: {
      type: String,
      required: true,
    },
    image3: {
      type: String,
      required: true,
    },
    image4: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    isWearable: {
      type: Boolean,
      default: false,
    },
    size: {
      type: [String],
      default: [],
    },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: {
      type: Date,
    },
    rejectedReason: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    replacementDays: {
      type: Number,
      default: 0,
    },
    freeDelivery: {
      type: Boolean,
      default: false,
    },
    warranty: {
      type: String,
      default: "No warranty",
    },
    payOnDelivery: {
      type: Boolean,
      default: false,
    },
    detailsPoints: {
      type: [String],
      default: [],
    },
    reviews: {
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
          image: {
            type: String,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const Product =
  mongoose.models?.Product ||
  mongoose.model<IProduct>("Product", productSchema);

export default Product;
