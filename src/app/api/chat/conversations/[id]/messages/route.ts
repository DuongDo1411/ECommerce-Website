import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import {
  findConversationForUser,
  getOtherParticipantId,
  getParticipantSide,
  isCloudinaryImageUrl,
  isValidObjectId,
  makeMessagePreview,
  MAX_CHAT_TEXT_LENGTH,
} from "@/lib/chat";
import { getIO } from "@/lib/socket-server";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { NextRequest, NextResponse } from "next/server";

const messagePopulate = { path: "sender", select: "name image shopName" };
const conversationPopulate = [
  { path: "buyer", select: "name image email" },
  { path: "vendor", select: "name image email shopName" },
  { path: "lastMessageSender", select: "name image" },
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const conversation = await findConversationForUser(id, session.user.id);

    if (!conversation) {
      return NextResponse.json(
        { message: "Conversation not found" },
        { status: 404 },
      );
    }

    const limit = Math.min(
      Math.max(Number(req.nextUrl.searchParams.get("limit")) || 30, 1),
      50,
    );
    const before = req.nextUrl.searchParams.get("before");
    const query: Record<string, unknown> = { conversation: id };

    if (before && isValidObjectId(before)) {
      const beforeMessage = await Message.findById(before).select("createdAt");
      if (beforeMessage) {
        query.createdAt = { $lt: beforeMessage.createdAt };
      }
    }

    const messages = await Message.find(query)
      .populate(messagePopulate)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return NextResponse.json(
      { messages: messages.reverse(), hasMore: messages.length === limit },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to fetch messages: ${error}` },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const conversation = await findConversationForUser(id, session.user.id);

    if (!conversation) {
      return NextResponse.json(
        { message: "Conversation not found" },
        { status: 404 },
      );
    }

    const senderSide = getParticipantSide(conversation, session.user.id);
    if (!senderSide) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const { type, content } = await req.json();

    if (type !== "text" && type !== "image") {
      return NextResponse.json(
        { message: "Message type is invalid" },
        { status: 400 },
      );
    }

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { message: "Message content is required" },
        { status: 400 },
      );
    }

    const normalizedContent = content.trim();
    if (type === "text" && normalizedContent.length > MAX_CHAT_TEXT_LENGTH) {
      return NextResponse.json(
        { message: `Message must be ${MAX_CHAT_TEXT_LENGTH} characters or less` },
        { status: 400 },
      );
    }

    if (type === "image" && !isCloudinaryImageUrl(normalizedContent)) {
      return NextResponse.json(
        { message: "Image URL must come from Cloudinary upload" },
        { status: 400 },
      );
    }

    const message = await Message.create({
      conversation: id,
      sender: session.user.id,
      senderSide,
      type,
      content: normalizedContent,
      readAt: null,
    });

    const unreadField = senderSide === "buyer" ? "vendorUnread" : "buyerUnread";
    const updatedConversation = await Conversation.findByIdAndUpdate(
      id,
      {
        $set: {
          lastMessagePreview: makeMessagePreview(type, normalizedContent),
          lastMessageType: type,
          lastMessageSender: session.user.id,
          lastMessageAt: new Date(),
        },
        $inc: { [unreadField]: 1 },
      },
      { new: true },
    )
      .populate(conversationPopulate)
      .lean();

    const populatedMessage = await Message.findById(message._id)
      .populate(messagePopulate)
      .lean();

    const receiverId = getOtherParticipantId(conversation, senderSide);
    const io = getIO();

    io?.to(`conversation:${id}`).emit("new_message", {
      message: populatedMessage,
      conversation: updatedConversation,
    });
    io?.to(`user:${conversation.buyer.toString()}`).emit("conversation_updated", {
      conversation: updatedConversation,
    });
    io?.to(`user:${conversation.vendor.toString()}`).emit("conversation_updated", {
      conversation: updatedConversation,
    });
    io?.to(`user:${receiverId}`).emit("unread_update", {
      conversationId: id,
      side: senderSide === "buyer" ? "vendor" : "buyer",
      count:
        senderSide === "buyer"
          ? updatedConversation?.vendorUnread ?? 0
          : updatedConversation?.buyerUnread ?? 0,
    });

    return NextResponse.json(
      { message: populatedMessage, conversation: updatedConversation },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to send message: ${error}` },
      { status: 500 },
    );
  }
}
