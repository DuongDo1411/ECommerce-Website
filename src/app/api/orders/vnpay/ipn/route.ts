import connectDB from "@/lib/connectDB";
import { verifyVnpayReturn } from "@/lib/vnpay";
import {
  confirmVnpayPaidBatch,
  repairCancelledPaidVnpayRefunds,
} from "@/lib/vnpay-ipn";
import { releaseBatchIfFullyCancelled } from "@/lib/voucher/lifecycle";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

// VNPay calls this endpoint server-to-server after payment.
// Must respond with { RspCode, Message }; any non-200 HTTP or wrong body
// causes VNPay to retry up to 10 times at 5-minute intervals.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const query = Object.fromEntries(req.nextUrl.searchParams.entries());
    const result = verifyVnpayReturn(query);

    if (!result.isValid) {
      return NextResponse.json(
        { RspCode: "97", Message: "Invalid signature" },
        { status: 200 },
      );
    }

    const orders = await Order.find({
      "paymentDetails.vnpayTxnRef": result.txnRef,
    });

    if (!orders.length) {
      return NextResponse.json(
        { RspCode: "01", Message: "Order not found" },
        { status: 200 },
      );
    }

    const isSuccess = result.responseCode === "00";

    // Guard: already processed. If a previous attempt marked the batch paid
    // but missed refund markers for cancelled rows, repair them before acking.
    if (orders.every((order) => order.isPaid)) {
      if (isSuccess) {
        await repairCancelledPaidVnpayRefunds(result.txnRef);
      }
      return NextResponse.json(
        { RspCode: "02", Message: "Order already confirmed" },
        { status: 200 },
      );
    }

    if (isSuccess) {
      const expected = orders.reduce(
        (sum, order) => sum + Number(order.totalAmount ?? 0),
        0,
      );
      if (Math.round(result.amount) !== Math.round(expected)) {
        return NextResponse.json(
          { RspCode: "04", Message: "Invalid amount" },
          { status: 200 },
        );
      }

      // One pipeline updates payment details and marks already-cancelled orders
      // for refund in the same per-document atomic write.
      await confirmVnpayPaidBatch(result);
      await repairCancelledPaidVnpayRefunds(result.txnRef);
    } else {
      // Payment failed or cancelled: cancel pending orders and restore stock.
      const failedOrders = await Order.find({
        "paymentDetails.vnpayTxnRef": result.txnRef,
        isPaid: false,
        orderStatus: "pending",
      });

      for (const order of failedOrders) {
        for (const item of order.products) {
          const productId =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (item.product as any)?._id?.toString?.() ?? item.product.toString();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const size: string | null = (item as any).size ?? null;

          if (size) {
            await Product.findByIdAndUpdate(
              productId,
              { $inc: { "sizeStock.$[elem].stock": item.quantity, stock: item.quantity } },
              { arrayFilters: [{ "elem.size": size }] },
            );
          } else {
            await Product.findByIdAndUpdate(productId, {
              $inc: { stock: item.quantity },
            });
          }
          await Product.findByIdAndUpdate(productId, { isStockAvailable: true });
        }

        order.orderStatus = "cancelled";
        order.cancelledAt = new Date();
        await order.save();
      }

      const checkoutBatchId = failedOrders[0]?.checkoutBatchId;
      if (checkoutBatchId) {
        await releaseBatchIfFullyCancelled(checkoutBatchId);
      }
    }

    return NextResponse.json(
      { RspCode: "00", Message: "Confirm Success" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { RspCode: "99", Message: "Internal error" },
      { status: 200 },
    );
  }
}
