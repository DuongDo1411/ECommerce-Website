import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Order from "@/model/order.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const session = await auth();

    if (!session || !session.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const orders = await Order.find({ buyer: session.user.id })
      .populate({
        path: "products.product",
        select: "title image1 price",
      })
      .populate({
        path: "productVendor",
        select: "shopName name",
      })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ orders }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Khong the tai don hang" },
      { status: 500 },
    );
  }
}
