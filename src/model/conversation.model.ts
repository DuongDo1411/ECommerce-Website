import mongoose from "mongoose";

export interface IConversation {
  _id?: mongoose.Types.ObjectId;
  buyer: mongoose.Types.ObjectId;
  vendor: mongoose.Types.ObjectId;
  lastMessagePreview?: string;
  lastMessageType?: "text" | "image";
  lastMessageSender?: mongoose.Types.ObjectId;
  lastMessageAt?: Date;
  buyerUnread: number;
  vendorUnread: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const conversationSchema = new mongoose.Schema<IConversation>(
  {
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastMessagePreview: {
      type: String,
      default: "",
    },
    lastMessageType: {
      type: String,
      enum: ["text", "image"],
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastMessageAt: {
      type: Date,
    },
    buyerUnread: {
      type: Number,
      default: 0,
      min: 0,
    },
    vendorUnread: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

conversationSchema.index({ buyer: 1, vendor: 1 }, { unique: true });
conversationSchema.index({ buyer: 1, lastMessageAt: -1 });
conversationSchema.index({ vendor: 1, lastMessageAt: -1 });

const Conversation =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", conversationSchema);

export default Conversation;
