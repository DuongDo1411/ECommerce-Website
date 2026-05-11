import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Order from "@/model/order.model";
import { NextRequest, NextResponse } from "next/server";

const VALID_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await connectDB();
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await params;
    const { orderStatus } = await req.json();

    if (!VALID_STATUSES.includes(orderStatus)) {
      return NextResponse.json({ message: "Invalid status" }, { status: 400 });
    }

    const order = await Order.findOne({
      _id: orderId,
      productVendor: session.user.id,
    });

    if (!order) {
      return NextResponse.json(
        { message: "Order not found or not yours" },
        { status: 404 },
      );
    }

    order.orderStatus = orderStatus;
    await order.save();

    return NextResponse.json(
      { message: "Order status updated", orderStatus: order.orderStatus },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to update order: ${error}` },
      { status: 500 },
    );
  }
}
