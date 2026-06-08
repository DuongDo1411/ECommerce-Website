import connectDB from "@/lib/connectDB";
import { mapGhnStatusToOrderStatus } from "@/lib/ghn";
import Order from "@/model/order.model";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ghn/webhook — GHN pushes order status changes here.
// Public (GHN calls it, no auth). Must always return HTTP 200 so GHN
// does not retry endlessly. Body fields are PascalCase.
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));

    const orderCode: string | undefined = body.OrderCode;
    const clientOrderCode: string | undefined = body.ClientOrderCode;
    const status: string | undefined = body.Status;
    const time = body.Time ? new Date(body.Time) : new Date();

    if (status && (orderCode || clientOrderCode)) {
      const order = await Order.findOne(
        clientOrderCode
          ? { _id: clientOrderCode }
          : { "ghn.orderCode": orderCode },
      );

      if (order) {
        order.ghn = order.ghn ?? {};
        order.ghn.status = status;
        order.ghn.statusLog = [
          ...(order.ghn.statusLog ?? []),
          { status, time },
        ];
        const mapped = mapGhnStatusToOrderStatus(status);
        if (mapped) {
          order.orderStatus = mapped;
          if (mapped === "delivered" && order.paymentMethod === "cod") {
            order.isPaid = true;
          }
        }
        await order.save();
      }
    }

    // Acknowledge regardless so GHN stops retrying.
    return NextResponse.json({ message: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[GHN webhook] error:", error);
    // Still 200 — we don't want GHN hammering retries on our bug.
    return NextResponse.json({ message: "ok" }, { status: 200 });
  }
}
