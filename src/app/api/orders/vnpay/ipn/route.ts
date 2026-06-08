import connectDB from "@/lib/connectDB";
import { verifyVnpayReturn } from "@/lib/vnpay";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import { NextRequest, NextResponse } from "next/server";

// VNPay calls this endpoint server-to-server after payment.
// Must respond with { RspCode, Message } — any non-200 HTTP or wrong body
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

    // Guard: already processed
    if (orders[0].isPaid) {
      return NextResponse.json(
        { RspCode: "02", Message: "Order already confirmed" },
        { status: 200 },
      );
    }

    if (result.responseCode === "00") {
      await Order.updateMany(
        { "paymentDetails.vnpayTxnRef": result.txnRef },
        {
          $set: {
            isPaid: true,
            "paymentDetails.vnpayTransactionNo": result.transactionNo,
            "paymentDetails.vnpayBankCode": result.bankCode,
            "paymentDetails.vnpayResponseCode": result.responseCode,
            "paymentDetails.vnpayPayDate": result.payDate,
            "paymentDetails.vnpayOrderInfo": result.orderInfo,
            "paymentDetails.vnpayAmount": result.amount,
          },
        },
      );
    } else {
      // Payment failed or cancelled — cancel pending orders and restore stock
      const failedOrders = await Order.find({
        "paymentDetails.vnpayTxnRef": result.txnRef,
        isPaid: false,
        orderStatus: "pending",
      });

      for (const order of failedOrders) {
        for (const item of order.products) {
          const productId =
            (item.product as any)?._id?.toString?.() ?? item.product.toString();
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
