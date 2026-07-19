import { describe, expect, it } from "vitest";
import {
  addDays,
  availableActionsFor,
  canConfirmReadyForPickup,
  checkReturnEligibility,
  computeRefundBreakdown,
  computeReturnEligibleUntil,
  computeReturnWindowDays,
  CONFIRM_READY_ACTION,
  getReasonPolicy,
  isDecidableFault,
  isTerminalReturnStatus,
  resolvesWithoutRefund,
  returnShippingPayer,
  validateTransition,
} from "./policy";

describe("availableActionsFor", () => {
  it("admin khong duoc xu ly truc tiep case moi gui", () => {
    expect(
      availableActionsFor({
        status: "requested",
        role: "admin",
        orderIsPaid: true,
      }),
    ).toHaveLength(0);
  });

  it("vendor tu choi sau kiem dinh bang action rieng", () => {
    const actions = availableActionsFor({
      status: "inspection_pending",
      role: "vendor",
      orderIsPaid: true,
    });
    expect(actions).toContain("reject_inspection");
    expect(actions).not.toContain("reject");
  });

  it("khong cho khai van don tay khi case da co van don GHN", () => {
    const actions = availableActionsFor({
      status: "awaiting_return_shipment",
      role: "buyer",
      hasGhnOrder: true,
    });
    expect(actions).not.toContain("submit_manual_shipment");
  });

  it("khong cho khai van don tay sau han gui hang", () => {
    const actions = availableActionsFor({
      status: "awaiting_return_shipment",
      role: "buyer",
      hasGhnOrder: false,
      shipmentDeadlinePassed: true,
    });
    expect(actions).not.toContain("submit_manual_shipment");
  });

  it("COD chua thu tien chi duoc dong khong hoan tai stage da nhan hoac mat hang", () => {
    const vendorReview = availableActionsFor({
      status: "escalated",
      role: "admin",
      escalationStage: "vendor_review",
      orderIsPaid: false,
    });
    expect(vendorReview).not.toContain("resolve_no_refund");

    const inspection = availableActionsFor({
      status: "escalated",
      role: "admin",
      escalationStage: "inspection",
      orderIsPaid: false,
    });
    expect(inspection).toContain("resolve_no_refund");
  });

  it("vendor xác nhận nhận hàng CHỈ với vận đơn tự khai", () => {
    const manual = availableActionsFor({
      status: "return_in_transit",
      role: "vendor",
      shippingMode: "manual",
    });
    expect(manual).toContain("mark_received");

    // Vận đơn GHN tự cập nhật khi giao tới — không có nút xác nhận tay.
    const ghn = availableActionsFor({
      status: "return_in_transit",
      role: "vendor",
      shippingMode: "ghn",
    });
    expect(ghn).not.toContain("mark_received");
  });

  it("vendor KHÔNG có hành động nào trên case đã leo thang", () => {
    const actions = availableActionsFor({
      status: "escalated",
      role: "vendor",
      escalationStage: "vendor_review",
    });
    expect(actions).toHaveLength(0);
  });

  it("admin escalated 'inspection': duyệt hàng đã về, không phải duyệt trả", () => {
    const actions = availableActionsFor({
      status: "escalated",
      role: "admin",
      escalationStage: "inspection",
      orderIsPaid: true,
    });
    expect(actions).toContain("approve_received_return");
    // "Buộc trả hàng" vô nghĩa khi hàng đã nằm trong kho vendor.
    expect(actions).not.toContain("approve_return");
  });

  it("admin escalated 'outbound_delivery' + đơn chưa thu tiền: chỉ đóng không hoàn", () => {
    const actions = availableActionsFor({
      status: "escalated",
      role: "admin",
      escalationStage: "outbound_delivery",
      orderIsPaid: false,
    });
    expect(actions).toContain("resolve_no_refund");
    expect(actions).not.toContain("approve_refund_only");
  });

  it("admin refund_pending: xác nhận đã chuyển hoặc báo lỗi", () => {
    const actions = availableActionsFor({
      status: "refund_pending",
      role: "admin",
    });
    expect(actions).toEqual(
      expect.arrayContaining(["mark_processed", "mark_failed"]),
    );
  });

  it("case đã đóng: không còn hành động nào", () => {
    expect(
      availableActionsFor({ status: "resolved_no_refund", role: "admin" }),
    ).toHaveLength(0);
    expect(
      availableActionsFor({ status: "refunded", role: "buyer" }),
    ).toHaveLength(0);
  });

  it("buyer chờ gửi GHN: hiện nút 'sẵn sàng bàn giao'", () => {
    const actions = availableActionsFor({
      status: "awaiting_return_shipment",
      role: "buyer",
      shippingMode: "ghn",
      hasGhnOrder: true,
    });
    expect(actions).toContain(CONFIRM_READY_ACTION);
  });

  it("đã xác nhận rồi thì nút biến mất (một lần duy nhất)", () => {
    const actions = availableActionsFor({
      status: "awaiting_return_shipment",
      role: "buyer",
      shippingMode: "ghn",
      hasGhnOrder: true,
      hasBuyerReadyConfirmation: true,
    });
    expect(actions).not.toContain(CONFIRM_READY_ACTION);
  });
});

describe("canConfirmReadyForPickup", () => {
  const ok = {
    status: "awaiting_return_shipment" as const,
    role: "buyer" as const,
    shippingMode: "ghn",
    hasGhnOrder: true,
  };

  it("đủ điều kiện: GHN, có mã vận đơn, chưa xác nhận, còn hạn", () => {
    expect(canConfirmReadyForPickup(ok)).toBe(true);
  });

  it("chưa có mã vận đơn GHN ⇒ không cho (chưa biết đưa hàng cho ai)", () => {
    expect(canConfirmReadyForPickup({ ...ok, hasGhnOrder: false })).toBe(false);
  });

  it("vận đơn tự khai (manual) ⇒ không áp dụng nút này", () => {
    expect(canConfirmReadyForPickup({ ...ok, shippingMode: "manual" })).toBe(
      false,
    );
  });

  it("đã xác nhận trước đó ⇒ không lặp (idempotent ở tầng hiển thị)", () => {
    expect(
      canConfirmReadyForPickup({ ...ok, hasBuyerReadyConfirmation: true }),
    ).toBe(false);
  });

  it("quá hạn gửi hàng ⇒ không cho xác nhận", () => {
    expect(
      canConfirmReadyForPickup({ ...ok, shipmentDeadlinePassed: true }),
    ).toBe(false);
  });

  it("sai trạng thái (chưa duyệt / đã lấy hàng) ⇒ không cho", () => {
    expect(canConfirmReadyForPickup({ ...ok, status: "requested" })).toBe(false);
    expect(
      canConfirmReadyForPickup({ ...ok, status: "return_in_transit" }),
    ).toBe(false);
  });

  it("không phải buyer ⇒ không cho", () => {
    expect(canConfirmReadyForPickup({ ...ok, role: "vendor" })).toBe(false);
    expect(canConfirmReadyForPickup({ ...ok, role: "admin" })).toBe(false);
  });
});

describe("resolvesWithoutRefund", () => {
  it("đơn chưa thanh toán (COD giao hỏng): không có gì để hoàn", () => {
    expect(resolvesWithoutRefund({ isPaid: false, amount: 200_000 })).toBe(true);
  });

  it("isPaid không xác định cũng coi là chưa thanh toán", () => {
    expect(resolvesWithoutRefund({ amount: 200_000 })).toBe(true);
  });

  it("đã thanh toán nhưng công thức ra 0đ: không có gì để hoàn", () => {
    expect(resolvesWithoutRefund({ isPaid: true, amount: 0 })).toBe(true);
  });

  it("đã thanh toán và còn tiền: phải đi qua hoàn tiền", () => {
    expect(resolvesWithoutRefund({ isPaid: true, amount: 1 })).toBe(false);
  });
});

describe("isDecidableFault", () => {
  it.each(["vendor", "buyer", "carrier"])("chấp nhận %s", (fault) => {
    expect(isDecidableFault(fault)).toBe(true);
  });

  // "unknown" quyết định ai trả phí ship hoàn và có hoàn phí ship gốc không —
  // chốt tiền dựa trên một kết luận chưa ai đưa ra là không chấp nhận được.
  it("từ chối 'unknown' làm kết luận cuối", () => {
    expect(isDecidableFault("unknown")).toBe(false);
  });

  it("từ chối giá trị rác", () => {
    expect(isDecidableFault("")).toBe(false);
    expect(isDecidableFault(undefined)).toBe(false);
  });
});

describe("computeReturnWindowDays", () => {
  it("lấy giá trị nhỏ nhất trong các item", () => {
    expect(computeReturnWindowDays([7, 15, 3])).toBe(3);
  });
  it("một item = 0 ⇒ cả đơn = 0 (không đủ điều kiện)", () => {
    expect(computeReturnWindowDays([7, 0, 15])).toBe(0);
  });
  it("undefined/null coi như 0", () => {
    expect(computeReturnWindowDays([undefined, 7])).toBe(0);
    expect(computeReturnWindowDays([null as unknown as number, 7])).toBe(0);
  });
  it("mảng rỗng ⇒ 0", () => {
    expect(computeReturnWindowDays([])).toBe(0);
  });
});

describe("computeReturnEligibleUntil", () => {
  it("= deliveryDate + windowDays", () => {
    const d = new Date("2026-01-01T00:00:00.000Z");
    expect(computeReturnEligibleUntil(d, 7)?.toISOString()).toBe(
      "2026-01-08T00:00:00.000Z",
    );
  });
  it("window 0 hoặc thiếu deliveryDate ⇒ null", () => {
    expect(computeReturnEligibleUntil(new Date(), 0)).toBeNull();
    expect(computeReturnEligibleUntil(null, 7)).toBeNull();
  });
});

describe("checkReturnEligibility", () => {
  const delivered = new Date("2026-01-01T00:00:00.000Z");
  const base = {
    orderStatus: "delivered",
    deliveryDate: delivered,
    windowDays: 7,
    hasOpenReturnRequest: false,
  };

  it("đủ điều kiện trong cửa sổ", () => {
    const r = checkReturnEligibility({
      ...base,
      now: addDays(delivered, 3),
    });
    expect(r.eligible).toBe(true);
    expect(r.eligibleUntil?.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("đã có yêu cầu mở ⇒ chặn", () => {
    const r = checkReturnEligibility({ ...base, hasOpenReturnRequest: true });
    expect(r).toMatchObject({ eligible: false, reason: "already_requested" });
  });

  it("chưa delivered ⇒ chặn", () => {
    const r = checkReturnEligibility({ ...base, orderStatus: "shipped" });
    expect(r).toMatchObject({ eligible: false, reason: "not_delivered" });
  });

  it("thiếu deliveryDate ⇒ chặn", () => {
    const r = checkReturnEligibility({ ...base, deliveryDate: null });
    expect(r).toMatchObject({ eligible: false, reason: "no_delivery_date" });
  });

  it("window = 0 ⇒ chặn", () => {
    const r = checkReturnEligibility({ ...base, windowDays: 0 });
    expect(r).toMatchObject({ eligible: false, reason: "window_zero" });
  });

  it("quá hạn ⇒ chặn", () => {
    const r = checkReturnEligibility({
      ...base,
      now: addDays(delivered, 8),
    });
    expect(r).toMatchObject({ eligible: false, reason: "window_closed" });
  });
});

describe("getReasonPolicy", () => {
  it("not_received không bắt buộc ảnh", () => {
    expect(getReasonPolicy("not_received").requiresEvidence).toBe(false);
  });
  it("các reason khác bắt buộc ảnh", () => {
    for (const r of [
      "damaged",
      "wrong_item",
      "changed_mind",
      "other",
    ] as const) {
      expect(getReasonPolicy(r).requiresEvidence).toBe(true);
    }
  });
});

describe("returnShippingPayer", () => {
  it("map lỗi → bên chịu phí", () => {
    expect(returnShippingPayer("vendor")).toBe("vendor");
    expect(returnShippingPayer("carrier")).toBe("platform");
    expect(returnShippingPayer("buyer")).toBe("buyer");
    expect(returnShippingPayer("unknown")).toBe("buyer");
  });
});

describe("computeRefundBreakdown", () => {
  // Đơn: hàng 200k, ship 30k, service 15k, không voucher → total = 245k.
  const paidOrder = {
    totalAmount: 245_000,
    serviceCharge: 15_000,
    deliveryCharge: 30_000,
    freeshipDiscount: 0,
  };

  it("lỗi vendor → hoàn hàng + phí ship đi, KHÔNG hoàn service", () => {
    const r = computeRefundBreakdown({ ...paidOrder, fault: "vendor" });
    expect(r.itemNet).toBe(200_000);
    expect(r.outboundShippingRefund).toBe(30_000);
    expect(r.amount).toBe(230_000); // 245k - 15k service
  });

  it("carrier fault cũng hoàn phí ship đi", () => {
    const r = computeRefundBreakdown({ ...paidOrder, fault: "carrier" });
    expect(r.amount).toBe(230_000);
  });

  it("đổi ý (buyer) → chỉ hoàn hàng, không hoàn ship đi", () => {
    const r = computeRefundBreakdown({ ...paidOrder, fault: "buyer" });
    expect(r.outboundShippingRefund).toBe(0);
    expect(r.amount).toBe(200_000); // 245k - 15k service - 30k ship
  });

  it("unknown fault xử lý như buyer (không hoàn ship)", () => {
    const r = computeRefundBreakdown({ ...paidOrder, fault: "unknown" });
    expect(r.amount).toBe(200_000);
  });

  it("freeship voucher làm phí ship thực trả = 0", () => {
    const r = computeRefundBreakdown({
      totalAmount: 215_000, // ship được freeship
      serviceCharge: 15_000,
      deliveryCharge: 30_000,
      freeshipDiscount: 30_000,
      fault: "vendor",
    });
    expect(r.outboundShippingRefund).toBe(0);
    expect(r.itemNet).toBe(200_000);
    expect(r.amount).toBe(200_000);
  });

  it("trừ phí ship trả do buyer chịu (hệ thống ứng)", () => {
    const r = computeRefundBreakdown({
      ...paidOrder,
      fault: "buyer",
      returnShippingDeduction: 25_000,
    });
    expect(r.amount).toBe(175_000); // 200k - 25k
  });

  it("refund luôn ≥ 0 và ≤ totalAmount", () => {
    const r = computeRefundBreakdown({
      ...paidOrder,
      fault: "buyer",
      returnShippingDeduction: 999_000,
    });
    expect(r.amount).toBe(0);
  });
});

describe("validateTransition", () => {
  it("vendor duyệt trả từ requested", () => {
    expect(validateTransition("requested", "approve_return", "vendor")).toEqual({
      ok: true,
      to: "awaiting_return_shipment",
    });
  });

  it("reject: vendor(requested) → vendor_rejected, admin(escalated) → closed_rejected", () => {
    expect(validateTransition("requested", "reject", "vendor").to).toBe(
      "vendor_rejected",
    );
    expect(validateTransition("escalated", "reject", "admin").to).toBe(
      "closed_rejected",
    );
  });

  it("buyer không được duyệt trả (sai role)", () => {
    expect(validateTransition("requested", "approve_return", "buyer")).toEqual({
      ok: false,
      error: "forbidden_role",
    });
  });

  it("sai trạng thái nguồn", () => {
    expect(
      validateTransition("refunded", "approve_return", "vendor"),
    ).toMatchObject({ ok: false, error: "invalid_from" });
  });

  it("action không tồn tại", () => {
    expect(validateTransition("requested", "nope", "vendor")).toMatchObject({
      ok: false,
      error: "unknown_action",
    });
  });

  it("buyer appeal từ vendor_rejected → escalated", () => {
    expect(validateTransition("vendor_rejected", "appeal", "buyer").to).toBe(
      "escalated",
    );
  });

  it("admin mark_processed từ refund_pending → refunded", () => {
    expect(
      validateTransition("refund_pending", "mark_processed", "admin").to,
    ).toBe("refunded");
  });

  it("system timeout vendor response → escalated", () => {
    expect(
      validateTransition("requested", "timeout_vendor_response", "system").to,
    ).toBe("escalated");
  });
});

describe("isTerminalReturnStatus", () => {
  it("các trạng thái đóng", () => {
    expect(isTerminalReturnStatus("refunded")).toBe(true);
    expect(isTerminalReturnStatus("closed_rejected")).toBe(true);
    expect(isTerminalReturnStatus("cancelled_by_buyer")).toBe(true);
  });
  it("trạng thái đang mở", () => {
    expect(isTerminalReturnStatus("requested")).toBe(false);
    expect(isTerminalReturnStatus("refund_pending")).toBe(false);
  });
});
