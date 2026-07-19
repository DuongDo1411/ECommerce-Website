// Tính tiền hoàn cho một case dựa trên Order + bên có lỗi CUỐI CÙNG.
// Admin/vendor KHÔNG được nhập tay số tiền — luôn suy ra từ công thức.

import type { FaultParty } from "@/model/returnRequest.model";
import { computeRefundBreakdown, type RefundBreakdown } from "./policy";

type OrderMoney = {
  totalAmount?: number;
  serviceCharge?: number;
  deliveryCharge?: number;
  freeshipDiscount?: number;
};

export function computeCaseRefund(
  order: OrderMoney,
  fault: FaultParty,
  returnShippingDeduction = 0,
): RefundBreakdown {
  return computeRefundBreakdown({
    totalAmount: order.totalAmount ?? 0,
    serviceCharge: order.serviceCharge ?? 0,
    deliveryCharge: order.deliveryCharge ?? 0,
    freeshipDiscount: order.freeshipDiscount ?? 0,
    fault,
    returnShippingDeduction,
  });
}

type CaseShipping = {
  shipping?: { payer?: string; ghn?: { fee?: number } };
};

// Phí ship hoàn phải TRỪ vào tiền hoàn của buyer.
//
// Chỉ trừ khi buyer là bên chịu phí: vận đơn hoàn được tạo bằng tài khoản GHN của sàn
// (GHN không thu tiền người gửi trong mô hình này), nên sàn ứng trước rồi thu lại ở
// bước hoàn tiền. Lỗi vendor → vendor trả thẳng cho GHN khi nhận; lỗi carrier → sàn
// chịu. Cả hai trường hợp đó buyer không bị trừ đồng nào.
export function returnShippingDeductionFor(doc: CaseShipping): number {
  if (doc.shipping?.payer !== "buyer") return 0;
  return Math.max(0, Math.round(doc.shipping?.ghn?.fee ?? 0));
}

// $set cho ReturnRequest.refund khi case chuyển sang refund_pending.
export function refundPendingSet(breakdown: RefundBreakdown) {
  return {
    "refund.itemNet": breakdown.itemNet,
    "refund.outboundShippingRefund": breakdown.outboundShippingRefund,
    "refund.returnShippingDeduction": breakdown.returnShippingDeduction,
    "refund.amount": breakdown.amount,
    "refund.status": "pending",
  };
}
