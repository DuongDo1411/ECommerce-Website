import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { isValidObjectId } from "@/lib/chat";
import Conversation from "@/model/conversation.model";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

const conversationPopulate = [
  { path: "buyer", select: "name image email" },
  { path: "vendor", select: "name image email shopName" },
  { path: "lastMessageSender", select: "name image" },
];

export async function GET() {
  try {
    await connectDB();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const query =
      session.user.role === "vendor"
        ? { vendor: session.user.id }
        : session.user.role === "user"
          ? { buyer: session.user.id }
          : { _id: null };

    const conversations = await Conversation.find(query)
      .populate(conversationPopulate)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to fetch conversations: ${error}` },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { vendorId } = await req.json();

    if (!isValidObjectId(vendorId)) {
      return NextResponse.json(
        { message: "vendorId is invalid" },
        { status: 400 },
      );
    }

    if (vendorId === session.user.id) {
      return NextResponse.json(
        { message: "You cannot open a chat with your own shop" },
        { status: 400 },
      );
    }

    const vendor = await User.findOne({
      _id: vendorId,
      role: "vendor",
      isApproved: true,
    }).select("_id");

    if (!vendor) {
      return NextResponse.json(
        { message: "Vendor not found or not approved" },
        { status: 404 },
      );
    }

    const conversation = await Conversation.findOneAndUpdate(
      { buyer: session.user.id, vendor: vendorId },
      {
        $setOnInsert: {
          buyer: session.user.id,
          vendor: vendorId,
          buyerUnread: 0,
          vendorUnread: 0,
          lastMessagePreview: "",
        },
      },
      { upsert: true, new: true },
    ).populate(conversationPopulate);

    return NextResponse.json({ conversation }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to create conversation: ${error}` },
      { status: 500 },
    );
  }
}
