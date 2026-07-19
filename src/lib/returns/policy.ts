// Pure, side-effect-free helpers cho luồng hoàn/trả hàng.
// KHÔNG import model/DB ở đây — chỉ nhận primitives để dễ unit-test.

import type {
  EscalationReason,
  EscalationStage,
  FaultParty,
  ReturnReasonCode,
  ReturnStatus,
} from "@/model/returnRequest.model";

export type ActorRole = "buyer" | "vendor" | "admin" | "system";

/* ───────────────────────────  Time helpers  ─────────────────────── */

export const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

// Các mốc timeout (ngày) — khớp Coding Plan: 3 / 5 / 3 / 3.
export const DEADLINE_DAYS = {
  vendorResponse: 3,
  shipment: 5,
  inspection: 3,
  appeal: 3,
  manualShipmentEscalate: 15,
} as const;

/* ─────────────────────────  Return window  ──────────────────────── */

// Cửa sổ trả của cả đơn = giá trị NHỎ NHẤT trong các item (chính sách chặt nhất).
// Bất kỳ item nào = 0 ⇒ cả đơn không đủ điều kiện trả (window = 0).
export function computeReturnWindowDays(
  itemWindows: Array<number | undefined | null>,
): number {
  if (!itemWindows.length) return 0;
  let min = Infinity;
  for (const w of itemWindows) {
    const days = Number.isFinite(w as number) ? Math.max(0, Number(w)) : 0;
    if (days < min) min = days;
  }
  return min === Infinity ? 0 : min;
}

// Hạn cuối được phép trả = deliveryDate + windowDays. Null nếu window ≤ 0 hoặc thiếu deliveryDate.
export function computeReturnEligibleUntil(
  deliveryDate: Date | null | undefined,
  windowDays: number,
): Date | null {
  if (!deliveryDate || windowDays <= 0) return null;
  return addDays(deliveryDate, windowDays);
}

export interface EligibilityInput {
  orderStatus: string;
  deliveryDate: Date | null | undefined;
  windowDays: number;
  hasOpenReturnRequest: boolean;
  now?: Date;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?:
    | "not_delivered"
    | "no_delivery_date"
    | "window_closed"
    | "window_zero"
    | "already_requested";
  eligibleUntil?: Date | null;
}

export function checkReturnEligibility(
  input: EligibilityInput,
): EligibilityResult {
  const now = input.now ?? new Date();
  if (input.hasOpenReturnRequest)
    return { eligible: false, reason: "already_requested" };
  if (input.orderStatus !== "delivered")
    return { eligible: false, reason: "not_delivered" };
  if (!input.deliveryDate)
    return { eligible: false, reason: "no_delivery_date" };
  if (input.windowDays <= 0) return { eligible: false, reason: "window_zero" };

  const until = computeReturnEligibleUntil(input.deliveryDate, input.windowDays);
  if (!until || now.getTime() > until.getTime())
    return { eligible: false, reason: "window_closed", eligibleUntil: until };

  return { eligible: true, eligibleUntil: until };
}

/* ─────────────────────────  Reason policy  ──────────────────────── */

export interface ReasonPolicy {
  requiresEvidence: boolean;
  faultHint: FaultParty; // gợi ý; kết luận cuối do vendor/admin chốt
}

// not_received: không bắt buộc ảnh (chưa nhận hàng). Còn lại: bắt buộc ≥1 ảnh.
const REASON_POLICY: Record<ReturnReasonCode, ReasonPolicy> = {
  not_received: { requiresEvidence: false, faultHint: "carrier" },
  missing_item: { requiresEvidence: true, faultHint: "vendor" },
  wrong_item: { requiresEvidence: true, faultHint: "vendor" },
  damaged: { requiresEvidence: true, faultHint: "vendor" },
  defective: { requiresEvidence: true, faultHint: "vendor" },
  not_as_described: { requiresEvidence: true, faultHint: "vendor" },
  suspected_counterfeit: { requiresEvidence: true, faultHint: "vendor" },
  changed_mind: { requiresEvidence: true, faultHint: "buyer" },
  other: { requiresEvidence: true, faultHint: "unknown" },
};

export function getReasonPolicy(reasonCode: ReturnReasonCode): ReasonPolicy {
  return REASON_POLICY[reasonCode];
}

// Ai chịu phí ship trả dựa trên bên có lỗi cuối cùng.
export function returnShippingPayer(
  fault: FaultParty,
): "vendor" | "buyer" | "platform" {
  if (fault === "vendor") return "vendor";
  if (fault === "carrier") return "platform";
  return "buyer"; // buyer | unknown
}

/* ─────────────────────────  Refund formula  ─────────────────────── */

export interface RefundInput {
  totalAmount: number; // số tiền buyer thực trả cho đơn
  serviceCharge: number; // KHÔNG hoàn trong v1
  deliveryCharge: number;
  freeshipDiscount: number;
  fault: FaultParty;
  // Phí ship trả hệ thống đã ứng và buyer phải chịu → trừ vào refund.
  returnShippingDeduction?: number;
}

export interface RefundBreakdown {
  itemNet: number;
  outboundShippingRefund: number;
  returnShippingDeduction: number;
  amount: number;
}

// Suy ra từ SỐ TIỀN BUYER THỰC TRẢ nên luôn ≤ totalAmount, không phụ thuộc
// ý nghĩa chính xác của originalTotal:
//   outboundShippingPaid = max(0, deliveryCharge - freeshipDiscount)
//   refundableBase       = totalAmount - serviceCharge            (service phí không hoàn)
//   itemNet              = refundableBase - outboundShippingPaid   (phần hàng)
// Lỗi vendor/carrier: hoàn hàng + phí ship đi. Buyer/đổi ý/unknown: chỉ hoàn hàng.
export function computeRefundBreakdown(input: RefundInput): RefundBreakdown {
  const clampMoney = (n: number) => Math.max(0, Math.round(n));

  const outboundShippingPaid = clampMoney(
    input.deliveryCharge - input.freeshipDiscount,
  );
  const refundableBase = clampMoney(input.totalAmount - input.serviceCharge);
  const itemNet = clampMoney(refundableBase - outboundShippingPaid);

  const refundsOutbound = input.fault === "vendor" || input.fault === "carrier";
  const outboundShippingRefund = refundsOutbound ? outboundShippingPaid : 0;

  const deduction = clampMoney(input.returnShippingDeduction ?? 0);

  const gross = itemNet + outboundShippingRefund;
  const amount = Math.min(
    clampMoney(gross - deduction),
    clampMoney(input.totalAmount),
  );

  return {
    itemNet,
    outboundShippingRefund,
    returnShippingDeduction: deduction,
    amount,
  };
}

/* ───────────────────────────  State machine  ────────────────────── */

export interface TransitionRule {
  action: string;
  from: ReturnStatus[];
  to: ReturnStatus | ((from: ReturnStatus) => ReturnStatus);
  roles: ActorRole[];
}

// Bảng chuyển trạng thái hợp lệ. Route KHÔNG được tự gán status ngoài bảng này.
//
// Rule phải tách theo CẶP (action, from), không gộp nhiều `from` khác vai vào một dòng:
// `roles` áp cho cả dòng, nên gộp "requested" (vendor được quyết) chung với "escalated"
// (chỉ sàn được quyết) sẽ mở cửa cho vendor tự phán xử tranh chấp của chính mình —
// đúng thứ mà bước trọng tài sinh ra để chặn.
export const TRANSITIONS: TransitionRule[] = [
  // ── requested: vendor xử lý lần đầu ──
  {
    action: "approve_return",
    from: ["requested"],
    to: "awaiting_return_shipment",
    roles: ["vendor"],
  },
  {
    action: "approve_refund_only",
    from: ["requested"],
    to: "refund_pending",
    roles: ["vendor"],
  },
  {
    action: "reject",
    from: ["requested"],
    // vendor từ chối → vendor_rejected: buyer vẫn còn quyền khiếu nại.
    to: "vendor_rejected",
    roles: ["vendor"],
  },

  // ── escalated: TRỌNG TÀI — chỉ admin. Vendor là MỘT BÊN của tranh chấp. ──
  {
    action: "approve_return",
    from: ["escalated"],
    to: "awaiting_return_shipment",
    roles: ["admin"],
  },
  {
    action: "approve_refund_only",
    from: ["escalated"],
    to: "refund_pending",
    roles: ["admin"],
  },
  {
    action: "approve_received_return", // admin: hàng đã về, duyệt hoàn thẳng
    from: ["escalated"],
    to: "refund_pending",
    roles: ["admin"],
  },
  {
    action: "reject",
    from: ["escalated"],
    to: "closed_rejected", // chung thẩm: hết đường khiếu nại tiếp.
    roles: ["admin"],
  },
  {
    action: "buyer_cancel",
    from: ["requested", "awaiting_return_shipment"],
    to: "cancelled_by_buyer",
    roles: ["buyer"],
  },
  {
    action: "timeout_vendor_response",
    from: ["requested"],
    to: "escalated",
    roles: ["system"],
  },

  // ── awaiting_return_shipment ──
  {
    action: "submit_manual_shipment",
    from: ["awaiting_return_shipment"],
    to: "return_in_transit",
    roles: ["buyer", "system"],
  },
  {
    action: "carrier_pickup",
    from: ["awaiting_return_shipment"],
    to: "return_in_transit",
    roles: ["system"],
  },
  {
    action: "timeout_shipment",
    from: ["awaiting_return_shipment"],
    to: "expired_unshipped",
    roles: ["system"],
  },

  // ── return_in_transit ──
  {
    action: "delivered_to_vendor",
    from: ["awaiting_return_shipment", "return_in_transit"],
    to: "inspection_pending",
    roles: ["system"],
  },
  {
    // Vận đơn TỰ KHAI không có webhook GHN đẩy sự kiện — vendor phải tự xác nhận đã
    // nhận hàng, nếu không case sẽ kẹt ở return_in_transit tới khi cron timeout.
    // Route chỉ cho phép khi shipping.mode === "manual".
    action: "mark_received",
    from: ["return_in_transit"],
    to: "inspection_pending",
    roles: ["vendor"],
  },
  {
    action: "carrier_exception",
    from: ["return_in_transit"],
    to: "escalated",
    roles: ["system"],
  },
  {
    action: "late_delivery_to_vendor",
    from: ["escalated"],
    to: "inspection_pending",
    roles: ["system"],
  },
  {
    action: "outbound_returned_to_vendor",
    from: ["escalated"],
    to: "inspection_pending",
    roles: ["system"],
  },
  {
    action: "carrier_cancelled",
    from: ["awaiting_return_shipment", "return_in_transit"],
    to: "cancelled_by_buyer",
    roles: ["system"],
  },

  // ── inspection_pending ──
  {
    action: "accept_inspection",
    from: ["inspection_pending"],
    to: "refund_pending",
    roles: ["vendor"],
  },
  {
    action: "reject_inspection",
    from: ["inspection_pending"],
    to: "vendor_rejected",
    roles: ["vendor"],
  },
  {
    action: "timeout_inspection",
    from: ["inspection_pending"],
    to: "escalated",
    roles: ["system"],
  },

  // ── vendor_rejected ──
  {
    action: "appeal",
    from: ["vendor_rejected"],
    to: "escalated",
    roles: ["buyer"],
  },
  {
    action: "accept_rejection",
    from: ["vendor_rejected"],
    to: "closed_rejected",
    roles: ["buyer"],
  },
  {
    action: "timeout_appeal",
    from: ["vendor_rejected"],
    to: "closed_rejected",
    roles: ["system"],
  },

  // ── Chấp nhận nhưng KHÔNG có tiền hoàn (COD chưa thu tiền) ──
  // Đích riêng thay vì refund_pending: đẩy vào hàng đợi hoàn tiền một case không có
  // đồng nào để trả thì admin không bao giờ đóng được nó.
  {
    action: "resolve_no_refund",
    from: ["requested", "inspection_pending"],
    to: "resolved_no_refund",
    roles: ["vendor"],
  },
  {
    action: "resolve_no_refund",
    from: ["escalated"],
    to: "resolved_no_refund",
    roles: ["admin"],
  },

  // ── refund_pending / refund_failed ──
  {
    action: "mark_processed",
    from: ["refund_pending", "refund_failed"],
    to: "refunded",
    roles: ["admin"],
  },
  {
    action: "mark_failed",
    from: ["refund_pending"],
    to: "refund_failed",
    roles: ["admin"],
  },
  {
    action: "retry_refund",
    from: ["refund_failed"],
    to: "refund_pending",
    roles: ["admin"],
  },
];

export interface TransitionResult {
  ok: boolean;
  to?: ReturnStatus;
  error?: "unknown_action" | "invalid_from" | "forbidden_role";
}

export function validateTransition(
  from: ReturnStatus,
  action: string,
  role: ActorRole,
): TransitionResult {
  const byAction = TRANSITIONS.filter((t) => t.action === action);
  if (byAction.length === 0) return { ok: false, error: "unknown_action" };

  // Chốt rule theo (action + from) TRƯỚC, rồi mới xét vai trên đúng rule đó.
  // Xét vai trên "rule đầu tiên trùng action" là sai: quyền của vai ở trạng thái này
  // sẽ bị áp nhầm sang trạng thái khác.
  const rule = byAction.find((t) => t.from.includes(from));
  if (!rule) return { ok: false, error: "invalid_from" };
  if (!rule.roles.includes(role)) return { ok: false, error: "forbidden_role" };

  const to = typeof rule.to === "function" ? rule.to(from) : rule.to;
  return { ok: true, to };
}

/* ────────────────────────  Available actions  ───────────────────── */

// Ở "escalated", admin được làm gì phụ thuộc GIAI ĐOẠN leo thang.
// Ví dụ: "hàng đã về, duyệt hoàn thẳng" chỉ có nghĩa khi hàng THẬT SỰ đã tới kho vendor
// (stage=inspection). Cho phép nó ở stage vendor_review là chốt hàng đã về khi kiện hàng
// còn chưa rời tay người mua.
const ADMIN_ACTIONS_BY_STAGE: Record<EscalationStage, string[]> = {
  vendor_review: ["approve_return", "approve_refund_only", "reject"],
  return_shipping: ["approve_refund_only", "reject"],
  inspection: ["approve_received_return", "reject"],
  outbound_delivery: ["approve_refund_only", "reject"],
};

export interface AvailableActionsInput {
  status: ReturnStatus;
  role: ActorRole;
  shippingMode?: string | null;
  hasGhnOrder?: boolean;
  escalationStage?: EscalationStage | null;
  orderIsPaid?: boolean;
  // Buyer đã bấm "sẵn sàng bàn giao" chưa — nút xác nhận đóng gói chỉ hiện MỘT LẦN.
  hasBuyerReadyConfirmation?: boolean;
  // Đã quá hạn gửi hàng chưa (caller tự so deadlines.shipment với now để giữ hàm thuần).
  shipmentDeadlinePassed?: boolean;
}

// Hành động NGOÀI bảng transition: chỉ ghi nhận việc chuẩn bị hàng, KHÔNG đổi status.
// Cố ý tách khỏi TRANSITIONS để không ai nhầm nó là một bước chuyển trạng thái —
// hàng chỉ "đang chuyển hoàn" khi GHN báo đã lấy, không phải khi buyer tự nói đã đóng gói.
export const CONFIRM_READY_ACTION = "confirm_ready_for_pickup";

// Buyer có được bấm "đã đóng gói, sẵn sàng bàn giao" ngay lúc này không.
// Chỉ cho vận đơn GHN đã có mã (không có mã thì chưa biết đưa cho ai), chưa xác nhận lần
// nào, và chưa quá hạn gửi. Tách hàm riêng để cả availableActionsFor lẫn route dùng chung
// một điều kiện — không lệch nhau giữa "nút có hiện" và "API có nhận".
export function canConfirmReadyForPickup(input: AvailableActionsInput): boolean {
  return (
    input.status === "awaiting_return_shipment" &&
    input.role === "buyer" &&
    input.shippingMode === "ghn" &&
    input.hasGhnOrder === true &&
    input.hasBuyerReadyConfirmation !== true &&
    input.shipmentDeadlinePassed !== true
  );
}

/**
 * Hành động mà `role` thực sự được phép làm trên case này, ngay lúc này.
 *
 * Suy thẳng từ bảng TRANSITIONS rồi siết thêm các ràng buộc ngữ cảnh mà bảng không diễn
 * đạt được. API trả cái này cho UI để UI không phải đoán — nút hiện ra là nút bấm được.
 */
export function availableActionsFor(input: AvailableActionsInput): string[] {
  const actions = TRANSITIONS.filter(
    (rule) => rule.from.includes(input.status) && rule.roles.includes(input.role),
  ).map((rule) => rule.action);

  const transitionActions = [...new Set(actions)].filter((action) => {
    // Vận đơn GHN tự có sự kiện "delivered"; xác nhận tay chỉ dành cho vận đơn tự khai.
    if (action === "mark_received") return input.shippingMode === "manual";
    if (action === "submit_manual_shipment") {
      return !input.hasGhnOrder && input.shipmentDeadlinePassed !== true;
    }

    // Ở escalated, siết theo giai đoạn.
    if (input.status === "escalated" && input.role === "admin") {
      const stage = input.escalationStage;
      // Chưa biết giai đoạn (dữ liệu cũ) ⇒ chỉ cho bộ an toàn nhất.
      const allowed = stage
        ? ADMIN_ACTIONS_BY_STAGE[stage]
        : ["approve_refund_only", "reject"];

      // Đơn chưa thu tiền thì không có gì để hoàn: đóng bằng resolve_no_refund.
      if (action === "resolve_no_refund") {
        return (
          input.orderIsPaid !== true &&
          (stage === "inspection" || stage === "outbound_delivery")
        );
      }
      if (
        input.orderIsPaid !== true &&
        (action === "approve_refund_only" ||
          action === "approve_received_return")
      ) {
        return false;
      }
      return allowed.includes(action);
    }

    // Ngoài escalated, resolve_no_refund chỉ hợp lý khi thật sự không có tiền hoàn.
    if (action === "resolve_no_refund") return input.orderIsPaid !== true;

    return true;
  });

  // confirm_ready_for_pickup KHÔNG nằm trong TRANSITIONS (không đổi status) nên phải
  // append riêng ở đây khi đủ điều kiện — UI dựa vào đây để hiện nút "sẵn sàng bàn giao".
  if (canConfirmReadyForPickup(input)) {
    transitionActions.push(CONFIRM_READY_ACTION);
  }

  return transitionActions;
}

// Trạng thái đã đóng — không nhận thêm transition nghiệp vụ.
export const TERMINAL_RETURN_STATUSES: ReturnStatus[] = [
  "refunded",
  "resolved_no_refund",
  "closed_rejected",
  "cancelled_by_buyer",
  "expired_unshipped",
];

/* ─────────────────────────  Escalation  ─────────────────────────── */

// Action nào đẩy case lên sàn thì ứng với giai đoạn/lý do nào.
// Suy từ action thay vì bắt mỗi caller tự truyền: quên set thì case sẽ nằm trong queue
// trọng tài mà admin không biết đang xử tranh chấp gì.
export const ESCALATION_BY_ACTION: Record<
  string,
  { stage: EscalationStage; reason: EscalationReason }
> = {
  timeout_vendor_response: { stage: "vendor_review", reason: "vendor_timeout" },
  timeout_inspection: { stage: "inspection", reason: "inspection_timeout" },
  carrier_exception: { stage: "return_shipping", reason: "carrier_exception" },
};

/* ────────────────────  Bất biến về tiền và kết luận  ──────────────── */

// Bên có lỗi được phép dùng cho một quyết định DUYỆT.
// "unknown" bị loại có chủ đích: nó quyết định ai trả phí ship hoàn và có hoàn phí ship
// gốc hay không, nên để "chưa xác định" nghĩa là chốt tiền dựa trên một kết luận chưa ai
// đưa ra. Nó chỉ hợp lệ như phỏng đoán ban đầu (claimedFaultParty), không phải kết luận.
export const DECIDABLE_FAULTS: FaultParty[] = ["vendor", "buyer", "carrier"];

export function isDecidableFault(fault: unknown): fault is FaultParty {
  return DECIDABLE_FAULTS.includes(fault as FaultParty);
}

// Case chỉ được vào refund_pending khi THỰC SỰ có tiền để trả lại.
// COD chưa thu tiền (isPaid=false) hoặc công thức ra 0đ thì không có gì để hoàn —
// những case đó phải đóng bằng resolved_no_refund.
export function resolvesWithoutRefund(input: {
  isPaid?: boolean;
  amount: number;
}): boolean {
  return input.isPaid !== true || input.amount <= 0;
}

export function isTerminalReturnStatus(status: ReturnStatus): boolean {
  return TERMINAL_RETURN_STATUSES.includes(status);
}
