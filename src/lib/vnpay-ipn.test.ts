import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VnpayIpnResult } from "./vnpay";
import {
  buildConfirmVnpayPaidUpdate,
  confirmVnpayPaidBatch,
  repairCancelledPaidVnpayRefunds,
} from "./vnpay-ipn";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  checkoutBatchUpdateOne: vi.fn(),
}));

vi.mock("@/model/order.model", () => ({
  default: {
    updateMany: mocks.updateMany,
  },
}));

vi.mock("@/model/checkoutBatch.model", () => ({
  default: {
    updateOne: mocks.checkoutBatchUpdateOne,
  },
}));

function paidResult(overrides: Partial<VnpayIpnResult> = {}): VnpayIpnResult {
  return {
    isValid: true,
    responseCode: "00",
    txnRef: "txn-1",
    transactionNo: "vnp-transaction-1",
    bankCode: "NCB",
    amount: 120_000,
    orderInfo: "Thanh toan don hang",
    payDate: "20260620101010",
    ...overrides,
  };
}

describe("vnpay IPN helpers", () => {
  beforeEach(() => {
    mocks.updateMany.mockReset();
    mocks.checkoutBatchUpdateOne.mockReset();
  });

  it("marks cancelled rows for refund in the same paid update pipeline", () => {
    expect(buildConfirmVnpayPaidUpdate(paidResult())).toEqual([
      {
        $set: {
          isPaid: true,
          "paymentDetails.vnpayTransactionNo": "vnp-transaction-1",
          "paymentDetails.vnpayBankCode": "NCB",
          "paymentDetails.vnpayResponseCode": "00",
          "paymentDetails.vnpayPayDate": "20260620101010",
          "paymentDetails.vnpayOrderInfo": "Thanh toan don hang",
          "paymentDetails.vnpayAmount": 120_000,
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
    ]);
  });

  it("repairs paid cancelled rows that missed refund markers on retry", async () => {
    await repairCancelledPaidVnpayRefunds("txn-1");

    expect(mocks.updateMany).toHaveBeenCalledWith(
      {
        "paymentDetails.vnpayTxnRef": "txn-1",
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
  });

  it("only confirms unpaid rows in a VNPay batch", async () => {
    const result = paidResult();

    await confirmVnpayPaidBatch(result);

    expect(mocks.updateMany).toHaveBeenCalledWith(
      {
        "paymentDetails.vnpayTxnRef": "txn-1",
        isPaid: { $ne: true },
      },
      buildConfirmVnpayPaidUpdate(result),
    );
    expect(mocks.checkoutBatchUpdateOne).toHaveBeenCalledWith(
      { txnRef: "txn-1" },
      { $set: { status: "paid" } },
    );
  });
});
