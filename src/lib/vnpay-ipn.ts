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

export async function confirmVnpayPaidBatch(result: VnpayIpnResult) {
  const orders = await Order.updateMany(
    { "paymentDetails.vnpayTxnRef": result.txnRef, isPaid: { $ne: true } },
    buildConfirmVnpayPaidUpdate(result),
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
  );
}
