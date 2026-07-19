import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import {
  getGHNOrderDetail,
  GHNError,
  mapGhnStatusToVietnamese,
} from "@/lib/ghn";
import { applyOutboundOrderEvent } from "@/lib/returns/ghnEvents";
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

    const statusLog = (detail.log ?? []).map((l) => ({
      status: l.status,
      time: new Date(l.updated_date),
    }));

    // Đi qua CÙNG một hàm với webhook thay vì tự gán orderStatus.
    // Tự gán là bỏ sót hết phần còn lại: deliveryDate (thiếu thì cửa sổ đổi/trả không
    // tính được, và người mua sẽ không bao giờ mở được yêu cầu trả hàng),
    // returnEligibleUntil, settlement voucher, và case cho đơn giao hỏng.
    await applyOutboundOrderEvent({
      order,
      status: detail.status,
      statusLog,
      time:
        statusLog.at(-1)?.time instanceof Date &&
        !Number.isNaN(statusLog.at(-1)?.time.getTime())
          ? statusLog.at(-1)?.time
          : new Date(),
    });

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
