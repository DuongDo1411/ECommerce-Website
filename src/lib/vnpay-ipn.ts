import type { VnpayIpnResult } from "@/lib/vnpay";
import CheckoutBatch from "@/model/checkoutBatch.model";
import Order from "@/model/order.model";

export function buildConfirmVnpayPaidUpdate(result: VnpayIpnResult) {
  return [
    {
      $set: {
        isPaid: true,
        "paymentDetails.vnpayTransactionNo": result.transactionNo,
        "paymentDetails.vnpayBankCode": result.bankCode,
        "paymentDetails.vnpayResponseCode": result.responseCode,
        "paymentDetails.vnpayPayDate": result.payDate,
        "paymentDetails.vnpayOrderInfo": result.orderInfo,
        "paymentDetails.vnpayAmount": result.amount,
        returnedAmount: {
          $cond: [
            { $eq: ["$orderStatus", "cancelled"] },
            "$totalAmount",
            { $ifNull: ["$returnedAmount", 0] },
          ],
        },
        refundStatus: {
          $cond: [
            { $eq: ["$orderStatus", "cancelled"] },
            "pending",
            { $ifNull: ["$refundStatus", "none"] },
          ],
        },
      },
    },
  ];
}

// Mongoose 9 không còn tự nhận ra một mảng là aggregation pipeline: thiếu `updatePipeline` là
// nó ném MongooseError ngay, không phải cảnh báo. Hậu quả đã xảy ra ở production trong đúng
// nhánh nguy hiểm nhất — VNPay gọi IPN với chữ ký hợp lệ và số tiền khớp, ta ném lỗi rồi trả
// RspCode 99, nên khách bị trừ tiền mà đơn vẫn isPaid=false, còn cổng thì coi như xong.
//
// Không test nào bắt được vì vnpay-ipn.test.ts mock Order.updateMany, tức chỉ kiểm hình dạng
// tham số chứ không để Mongoose xác thực chúng. Quy ước đúng có sẵn ở rateLimit.ts.
const AS_PIPELINE = { updatePipeline: true } as const;

export async function confirmVnpayPaidBatch(result: VnpayIpnResult) {
  const orders = await Order.updateMany(
    { "paymentDetails.vnpayTxnRef": result.txnRef, isPaid: { $ne: true } },
    buildConfirmVnpayPaidUpdate(result),
    AS_PIPELINE,
  );
  await CheckoutBatch.updateOne(
    { txnRef: result.txnRef },
    { $set: { status: "paid" } },
  );
  return orders;
}

export async function repairCancelledPaidVnpayRefunds(txnRef: string) {
  return Order.updateMany(
    {
      "paymentDetails.vnpayTxnRef": txnRef,
      orderStatus: "cancelled",
      isPaid: true,
      refundStatus: { $ne: "processed" },
      $or: [
        { refundStatus: { $exists: false } },
        { refundStatus: "none" },
        { refundStatus: "failed" },
        { refundStatus: "pending", returnedAmount: { $lte: 0 } },
        { returnedAmount: { $exists: false } },
      ],
    },
    [{ $set: { returnedAmount: "$totalAmount", refundStatus: "pending" } }],
    AS_PIPELINE,
  );
}
