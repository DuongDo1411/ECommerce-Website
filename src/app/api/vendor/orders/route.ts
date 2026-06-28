import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import Order from "@/model/order.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;

    const orders = await Order.find({ productVendor: session.user.id })
      .populate({ path: "buyer", select: "name phone" })
      .populate({ path: "products.product", select: "title image1 price" })
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
