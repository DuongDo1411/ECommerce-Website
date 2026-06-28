import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { releaseBatchIfFullyCancelled } from "@/lib/voucher/lifecycle";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

// One product line on an order. `product` is an ObjectId when unpopulated and a
// populated document otherwise; both expose toString(), and only the populated
// form carries an `_id` — matching the original defensive id extraction.
interface OrderProductLine {
  product: { _id?: { toString(): string }; toString(): string };
  quantity: number;
  size?: string | null;
}

/**
 * POST /api/orders/vnpay/cancel-failed
 * Called by the client when VNPay returns with a non-"00" response code.
 * Finds all pending unpaid orders for this user with the given txnRef,
 * restores stock, and marks them as cancelled.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { txnRef } = await req.json();
    if (!txnRef) {
      return NextResponse.json({ message: "Thiếu txnRef" }, { status: 400 });
    }

    const orders = await Order.find({
      "paymentDetails.vnpayTxnRef": txnRef,
      buyer: session.user.id,
      isPaid: false,
      orderStatus: "pending",
    });

    // Idempotent — if already cancelled, just return
    if (orders.length === 0) {
      return NextResponse.json({ cancelled: 0 }, { status: 200 });
    }

    for (const order of orders) {
      for (const item of order.products as OrderProductLine[]) {
        const productId =
          item.product._id?.toString() ?? item.product.toString();
        const size: string | null = item.size ?? null;

        if (size) {
          await Product.findByIdAndUpdate(
            productId,
            {
              $inc: {
                "sizeStock.$[elem].stock": item.quantity,
                stock: item.quantity,
              },
            },
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

    const checkoutBatchId = orders[0]?.checkoutBatchId;
    if (checkoutBatchId) {
      await releaseBatchIfFullyCancelled(checkoutBatchId);
    }

    return NextResponse.json({ cancelled: orders.length }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Khong the huy don VNPay" },
      { status: 500 },
    );
  }
}
