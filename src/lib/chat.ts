import mongoose from "mongoose";
import Conversation, { IConversation } from "@/model/conversation.model";

export type ChatSide = "buyer" | "vendor";

export const MAX_CHAT_TEXT_LENGTH = 2000;
export const MAX_CHAT_IMAGE_SIZE = 5 * 1024 * 1024;

export function isValidObjectId(id: unknown) {
  return typeof id === "string" && mongoose.isValidObjectId(id);
}

export function getParticipantSide(
  conversation: Pick<IConversation, "buyer" | "vendor">,
  userId: string,
): ChatSide | null {
  const buyerId = conversation.buyer?.toString();
  const vendorId = conversation.vendor?.toString();

  if (buyerId === userId) return "buyer";
  if (vendorId === userId) return "vendor";
  return null;
}

export function getOtherParticipantId(
  conversation: Pick<IConversation, "buyer" | "vendor">,
  side: ChatSide,
) {
  return side === "buyer"
    ? conversation.vendor.toString()
    : conversation.buyer.toString();
}

export async function findConversationForUser(
  conversationId: string,
  userId: string,
) {
  if (!isValidObjectId(conversationId)) return null;

  const conversation = await Conversation.findOne({
    _id: conversationId,
    $or: [{ buyer: userId }, { vendor: userId }],
  });

  return conversation;
}

export function makeMessagePreview(type: "text" | "image", content: string) {
  if (type === "image") return "Đã gửi một hình ảnh";

  const trimmed = content.replace(/\s+/g, " ").trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
}

export function isCloudinaryImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "res.cloudinary.com" &&
      parsed.pathname.includes("/image/upload/")
    );
  } catch {
    return false;
  }
}
