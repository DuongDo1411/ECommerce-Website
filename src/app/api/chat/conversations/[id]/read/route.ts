import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { findConversationForUser, getParticipantSide } from "@/lib/chat";
import { getIO } from "@/lib/socket-server";
import Conversation from "@/model/conversation.model";
import Message from "@/model/message.model";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  _req: NextRequest,
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

    const side = getParticipantSide(conversation, session.user.id);
    if (!side) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const unreadField = side === "buyer" ? "buyerUnread" : "vendorUnread";

    await Message.updateMany(
      {
        conversation: id,
        sender: { $ne: session.user.id },
        readAt: null,
      },
      { $set: { readAt: now } },
    );

    const updatedConversation = await Conversation.findByIdAndUpdate(
      id,
      { $set: { [unreadField]: 0 } },
      { new: true },
    );

    const io = getIO();
    io?.to(`conversation:${id}`).emit("messages_read", {
      conversationId: id,
      readerId: session.user.id,
      readAt: now,
    });
    io?.to(`user:${session.user.id}`).emit("unread_update", {
      conversationId: id,
      side,
      count: 0,
    });

    return NextResponse.json(
      { conversation: updatedConversation, readAt: now, side },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to mark messages as read: ${error}` },
      { status: 500 },
    );
  }
}
