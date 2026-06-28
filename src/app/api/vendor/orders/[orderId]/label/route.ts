import connectDB from "@/lib/connectDB";
import { getPrintUrl, GHNError } from "@/lib/ghn";
import { requireRole } from "@/lib/rbac";
import Order from "@/model/order.model";
import { NextRequest, NextResponse } from "next/server";

// GET /api/vendor/orders/[orderId]/label — fresh GHN print URL (token ~30 min)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;
    const { orderId } = await params;
    const order = await Order.findOne({
      _id: orderId,
      productVendor: session.user.id,
    });
    if (!order?.ghn?.orderCode) {
      return NextResponse.json(
        { message: "Đơn chưa có mã vận đơn GHN" },
        { status: 400 },
      );
    }
    const url = await getPrintUrl(order.ghn.orderCode);
    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    console.error(error);
    const msg =
      error instanceof GHNError ? error.message : "Loi tao nhan GHN";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
