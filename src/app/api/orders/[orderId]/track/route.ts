import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import {
  getGHNOrderDetail,
  GHNError,
  mapGhnStatusToOrderStatus,
  mapGhnStatusToVietnamese,
} from "@/lib/ghn";
import Order from "@/model/order.model";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders/[orderId]/track — pull live GHN status (on-demand poll).
// Used for local dev where GHN webhooks can't reach localhost.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { orderId } = await params;
    const order = await Order.findOne({
      _id: orderId,
      buyer: session.user.id,
    });
    if (!order?.ghn?.orderCode) {
      return NextResponse.json(
        { message: "Đơn chưa có mã vận đơn GHN" },
        { status: 400 },
      );
    }

    const detail = await getGHNOrderDetail(order.ghn.orderCode);

    order.ghn.status = detail.status;
    order.ghn.statusLog = (detail.log ?? []).map((l) => ({
      status: l.status,
      time: new Date(l.updated_date),
    }));
    const mapped = mapGhnStatusToOrderStatus(detail.status);
    if (mapped) {
      order.orderStatus = mapped;
      if (mapped === "delivered" && order.paymentMethod === "cod") {
        order.isPaid = true;
      }
    }
    await order.save();

    return NextResponse.json(
      {
        status: detail.status,
        statusLabel: mapGhnStatusToVietnamese(detail.status),
        log: (detail.log ?? []).map((l) => ({
          status: l.status,
          label: mapGhnStatusToVietnamese(l.status),
          time: l.updated_date,
        })),
        expectedDeliveryTime: detail.leadtime,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    const msg =
      error instanceof GHNError ? error.message : "Loi theo doi don GHN";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
