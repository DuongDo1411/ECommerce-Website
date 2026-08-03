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

    // Năm nhánh từ chối bên dưới đều trả HTTP 200 kèm RspCode — đúng giao thức, nhưng nghĩa là
    // VNPay coi như xong và không thử lại, còn ta không còn dấu vết nào để tra. Đã xảy ra thật:
    // ba giao dịch báo Thành công ở cổng VNPay mà đơn vẫn isPaid=false, và không có cách nào
    // biết VNPay có gọi tới hay không.
    //
    // Log định danh giao dịch, KHÔNG log vnp_SecureHash: chữ ký không giúp gì cho chẩn đoán,
    // mà log là chỗ nhiều người đọc được.
    console.log(
      `[vnpay-ipn] txnRef=${result.txnRef} rspCode=${result.responseCode} amount=${result.amount} validSignature=${result.isValid}`,
    );

    if (!result.isValid) {
      console.warn(`[vnpay-ipn] 97 sai chữ ký — txnRef=${result.txnRef}`);
      return NextResponse.json(
        { RspCode: "97", Message: "Invalid signature" },
        { status: 200 },
      );
    }

    const orders = await Order.find({
      "paymentDetails.vnpayTxnRef": result.txnRef,
    });

    if (!orders.length) {
      console.warn(
        `[vnpay-ipn] 01 không tìm thấy đơn nào có paymentDetails.vnpayTxnRef=${result.txnRef}`,
      );
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
      console.log(
        `[vnpay-ipn] 02 đã xử lý trước đó — txnRef=${result.txnRef}, ${orders.length} đơn`,
      );
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
        console.warn(
          `[vnpay-ipn] 04 lệch tiền — txnRef=${result.txnRef}, VNPay=${result.amount}, tổng đơn=${expected}`,
        );
        return NextResponse.json(
          { RspCode: "04", Message: "Invalid amount" },
          { status: 200 },
        );
      }

      // One pipeline updates payment details and marks already-cancelled orders
      // for refund in the same per-document atomic write.
      await confirmVnpayPaidBatch(result);
      await repairCancelledPaidVnpayRefunds(result.txnRef);
      console.log(
        `[vnpay-ipn] 00 đã chốt thanh toán — txnRef=${result.txnRef}, ${orders.length} đơn`,
      );
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
  } catch (error) {
    // Trước đây `catch` không nhận tham số và không ghi gì: một lỗi database ở đây trả về 99
    // rồi biến mất không dấu vết, trong khi tiền của khách đã bị trừ. Đây là nhánh duy nhất
    // mà lỗi thuộc về phía ta, nên cũng là nhánh bắt buộc phải để lại vết.
    console.error("[vnpay-ipn] 99 lỗi nội bộ", error);
    return NextResponse.json(
      { RspCode: "99", Message: "Internal error" },
      { status: 200 },
    );
  }
}

// Chuẩn IPN 2.1.0 của VNPay gọi bằng GET với tham số trên query string, và đó là đường đi
// thật. POST ở đây chỉ để chẩn đoán: không khai báo thì Next.js trả 405 mà không ghi lại gì,
// nên một cổng gọi sai phương thức sẽ trông y hệt một cổng không gọi. Chuyển tiếp sang GET
// cho ra kết quả phân biệt được — tham số nằm ở body thì query rỗng và log hiện txnRef trống.
export async function POST(req: NextRequest) {
  console.warn(
    "[vnpay-ipn] nhận POST thay vì GET — chuyển tiếp sang GET, xem txnRef bên dưới có rỗng không",
  );
  return GET(req);
}
