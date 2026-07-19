import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { collectEvidence, discardEvidence } from "@/lib/returns/evidence";
import {
  finalizeReturnedOrder,
  StockRestoreError,
} from "@/lib/returns/lifecycle";
import { notifyReturnEvent } from "@/lib/returns/mail";
import {
  addDays,
  availableActionsFor,
  DEADLINE_DAYS,
  isDecidableFault,
  resolvesWithoutRefund,
  returnShippingPayer,
} from "@/lib/returns/policy";
import {
  computeCaseRefund,
  refundPendingSet,
  returnShippingDeductionFor,
} from "@/lib/returns/refund";
import { ensureReturnShipment } from "@/lib/returns/shipping";
import {
  transitionErrorResponse,
  transitionReturn,
} from "@/lib/returns/transition";
import {
  ReturnOperationError,
  withReturnTransaction,
} from "@/lib/returns/transaction";
import Order from "@/model/order.model";
import ReturnRequest, {
  type FaultParty,
  type ReturnStatus,
  type StockDisposition,
} from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

const VENDOR_ACTIONS = [
  "approve_return",
  "approve_refund_only",
  "reject",
  "accept_inspection",
  "reject_inspection",
  "mark_received",
] as const;
type VendorAction = (typeof VENDOR_ACTIONS)[number];


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;

    const { id } = await params;
    const doc = await ReturnRequest.findOne({
      _id: id,
      vendor: session.user.id,
    })
      .populate(
        "order",
        "products totalAmount serviceCharge deliveryCharge freeshipDiscount orderStatus deliveryDate refundStatus returnedAmount isPaid",
      )
      .populate("buyer", "name email")
      .lean();
    if (!doc) {
      return NextResponse.json(
        { message: "Không tìm thấy yêu cầu" },
        { status: 404 },
      );
    }

    // Server là nguồn sự thật về việc được làm gì — UI chỉ render, không tự suy luận.
    const availableActions = availableActionsFor({
      status: doc.status,
      role: "vendor",
      shippingMode: doc.shipping?.mode,
      escalationStage: doc.escalation?.stage,
      orderIsPaid: (doc.order as { isPaid?: boolean } | undefined)?.isPaid,
    });

    return NextResponse.json(
      { returnRequest: doc, availableActions },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ReturnOperationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    if (error instanceof StockRestoreError) {
      return NextResponse.json(
        {
          message: `${error.message}. Chọn "Hỏng - không nhập kho" để chốt mà không cộng tồn.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: `Không đọc được yêu cầu: ${error}` },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;
    const vendorId = session.user.id;

    const { id } = await params;
    const form = await req.formData();
    const action = String(form.get("action") ?? "") as VendorAction;
    const reason = String(form.get("reason") ?? "").trim();
    const fault = String(form.get("faultParty") ?? "") as FaultParty;
    const disposition = String(
      form.get("disposition") ?? "",
    ) as StockDisposition;

    if (!VENDOR_ACTIONS.includes(action)) {
      return NextResponse.json(
        { message: "Hành động không hợp lệ" },
        { status: 400 },
      );
    }

    // Ownership: chỉ case của chính vendor này.
    const doc = await ReturnRequest.findOne({ _id: id, vendor: vendorId });
    if (!doc) {
      return NextResponse.json(
        { message: "Không tìm thấy yêu cầu" },
        { status: 404 },
      );
    }

    const orderSummary = await Order.findById(doc.order).select("isPaid");
    if (!orderSummary) {
      return NextResponse.json(
        { message: "Không tìm thấy đơn hàng của yêu cầu" },
        { status: 404 },
      );
    }
    const allowed = availableActionsFor({
      status: doc.status,
      role: "vendor",
      shippingMode: doc.shipping?.mode,
      escalationStage: doc.escalation?.stage,
      orderIsPaid: orderSummary.isPaid,
    });
    if (!allowed.includes(action)) {
      return NextResponse.json(
        { message: "Hành động không hợp lệ ở trạng thái hiện tại" },
        { status: 409 },
      );
    }

    const from = doc.status as ReturnStatus;
    const now = new Date();
    const set: Record<string, unknown> = {};

    // ── Từ chối (trước hoặc sau kiểm định): bắt buộc lý do; sau kiểm định bắt
    //    buộc thêm bằng chứng. Buyer được mở cửa sổ khiếu nại 3 ngày.
    if (action === "reject" || action === "reject_inspection") {
      if (!reason) {
        return NextResponse.json(
          { message: "Vui lòng nêu lý do từ chối" },
          { status: 400 },
        );
      }
      const evidence = await collectEvidence(form);
      if ("error" in evidence) {
        return NextResponse.json(
          { message: evidence.error.message },
          { status: 400 },
        );
      }
      if (action === "reject_inspection" && evidence.urls.length === 0) {
        return NextResponse.json(
          { message: "Từ chối sau kiểm định phải kèm ảnh bằng chứng" },
          { status: 400 },
        );
      }
      set.vendorDecision = {
        action,
        // Từ chối lúc chưa cầm hàng khác hẳn từ chối sau khi đã mở kiện ra kiểm —
        // cùng đi qua transition "reject" nên phải ghi rõ giai đoạn để còn đối soát.
        stage: action === "reject_inspection" ? "inspection" : "request",
        reason,
        evidence: evidence.urls,
        actor: vendorId,
        at: now,
      };
      if (action === "reject_inspection") {
        set.inspection = {
          result: "rejected",
          note: reason,
          evidence: evidence.urls,
          actor: vendorId,
          at: now,
        };
      }
      set["deadlines.appeal"] = addDays(now, DEADLINE_DAYS.appeal);

      // reject_inspection dùng chung transition "reject"
      // (requested | inspection_pending → vendor_rejected).
      let result;
      try {
        result = await transitionReturn({
          id: doc._id,
          from,
          action,
          role: "vendor",
          actorId: vendorId,
          reason,
          set,
        });
      } catch (error) {
        await discardEvidence(evidence);
        throw error;
      }
      if (!result.ok) {
        await discardEvidence(evidence);
        const mapped = transitionErrorResponse(result.error);
        return NextResponse.json(
          { message: mapped.message },
          { status: mapped.status },
        );
      }
      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: "rejected",
        note: reason,
      });
      return NextResponse.json(
        { message: "Đã từ chối yêu cầu", status: result.to },
        { status: 200 },
      );
    }

    // ── Xác nhận đã nhận hàng của vận đơn TỰ KHAI.
    // Vận đơn GHN có sự kiện "delivered" tự đẩy case sang kiểm định; vận đơn tự khai thì
    // không ai báo, nên nếu không có nút này case sẽ kẹt tới lúc hết hạn.
    if (action === "mark_received") {
      if (doc.shipping?.mode !== "manual") {
        return NextResponse.json(
          {
            message:
              "Vận đơn GHN tự cập nhật khi giao tới — không cần xác nhận tay",
          },
          { status: 400 },
        );
      }
      if (!doc.shipping.submittedAt || !doc.shipping.trackingCode) {
        return NextResponse.json(
          { message: "Vận đơn tự khai chưa có đủ thông tin gửi hàng" },
          { status: 409 },
        );
      }

      const result = await transitionReturn({
        id: doc._id,
        from,
        action,
        role: "vendor",
        actorId: vendorId,
        reason: reason || undefined,
        set: {
          "shipping.receivedAt": now,
          "shipping.receivedBy": vendorId,
          "shipping.status": "delivered",
          // Mở hạn kiểm định kể từ lúc vendor xác nhận cầm hàng.
          "deadlines.inspection": addDays(now, DEADLINE_DAYS.inspection),
        },
        push: {
          "shipping.statusLog": { status: "delivered", time: now },
        },
      });
      if (!result.ok) {
        const mapped = transitionErrorResponse(result.error);
        return NextResponse.json(
          { message: mapped.message },
          { status: mapped.status },
        );
      }
      return NextResponse.json(
        { message: "Đã xác nhận nhận hàng, hãy kiểm định", status: result.to },
        { status: 200 },
      );
    }

    // ── Duyệt: bắt buộc kết luận bên có lỗi (quyết định phí ship trả & refund).
    if (action === "approve_return" || action === "approve_refund_only") {
      // "unknown" không được chấp nhận ở đây: nó quyết định tiền.
      if (!isDecidableFault(fault)) {
        return NextResponse.json(
          {
            message:
              "Vui lòng kết luận bên chịu trách nhiệm: người bán, người mua hoặc đơn vị vận chuyển",
          },
          { status: 400 },
        );
      }
      set.finalFaultParty = fault;
      set.vendorDecision = { action, reason, actor: vendorId, at: now };
    }

    if (action === "approve_return") {
      set.resolution = "return_and_refund";
      set["shipping.payer"] = returnShippingPayer(fault);
      set["shipping.status"] = "creating";
      set["deadlines.shipment"] = addDays(now, DEADLINE_DAYS.shipment);

      const result = await transitionReturn({
        id: doc._id,
        from,
        action,
        role: "vendor",
        actorId: vendorId,
        reason: reason || undefined,
        set,
      });
      if (!result.ok) {
        const mapped = transitionErrorResponse(result.error);
        return NextResponse.json(
          { message: mapped.message },
          { status: mapped.status },
        );
      }

      // Tạo vận đơn hoàn — best-effort: GHN lỗi KHÔNG được huỷ quyết định đã duyệt.
      // Case nằm lại ở awaiting_return_shipment với shipping.status=creation_failed,
      // vendor bấm thử lại hoặc cron tự tạo bù.
      const shipment = await ensureReturnShipment(doc._id);
      // Gửi mail SAU khi có vận đơn để buyer nhận được kèm mã vận đơn.
      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: "approved_return",
      });
      return NextResponse.json(
        {
          message: shipment.ok
            ? "Đã duyệt trả hàng, chờ người mua gửi hàng"
            : "Đã duyệt trả hàng nhưng chưa tạo được vận đơn hoàn — hãy thử tạo lại",
          status: result.to,
          shipping: shipment.ok
            ? { orderCode: shipment.orderCode }
            : { error: shipment.error },
        },
        { status: 200 },
      );
    }

    // ── Hoàn tiền không cần trả hàng: order giữ nguyên "delivered".
    if (action === "approve_refund_only") {
      const outcome = await withReturnTransaction(async (dbSession) => {
        const txOrder = await Order.findById(doc.order).session(dbSession);
        if (!txOrder) {
          throw new ReturnOperationError(
            "Không tìm thấy đơn hàng của yêu cầu",
            404,
          );
        }
        const breakdown = computeCaseRefund(txOrder, fault);
        const noRefund = resolvesWithoutRefund({
          isPaid: txOrder.isPaid,
          amount: breakdown.amount,
        });
        const txSet = { ...set };
        if (noRefund) {
          txSet.resolution = "no_refund";
        } else {
          txSet.resolution = "refund_only";
          Object.assign(txSet, refundPendingSet(breakdown));
        }

        const result = await transitionReturn({
          id: doc._id,
          from,
          action: noRefund ? "resolve_no_refund" : action,
          role: "vendor",
          actorId: vendorId,
          reason: reason || undefined,
          set: txSet,
          session: dbSession,
        });
        if (result.ok && !noRefund) {
          txOrder.returnedAmount = breakdown.amount;
          txOrder.refundStatus = "pending";
          await txOrder.save({ session: dbSession });
        }
        return { result, breakdown, noRefund };
      });

      if (!outcome.result.ok) {
        const mapped = transitionErrorResponse(outcome.result.error);
        return NextResponse.json(
          { message: mapped.message },
          { status: mapped.status },
        );
      }
      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: outcome.noRefund ? "resolved_no_refund" : "approved_refund_only",
      });
      return NextResponse.json(
        {
          message: outcome.noRefund
            ? "Đã chấp nhận yêu cầu. Đơn chưa thanh toán nên không phát sinh hoàn tiền."
            : "Đã duyệt hoàn tiền, chờ admin xác nhận chuyển tiền",
          status: outcome.result.to,
          refund: outcome.noRefund ? null : outcome.breakdown,
        },
        { status: 200 },
      );
    }

    // ── Kiểm định đạt: hàng vật lý đã về → chốt returned + hoàn kho theo disposition.
    if (action === "accept_inspection") {
      if (disposition !== "restock" && disposition !== "damaged") {
        return NextResponse.json(
          { message: "Vui lòng chọn xử lý hàng hoàn: restock hoặc damaged" },
          { status: 400 },
        );
      }
      if (!doc.shipping?.receivedAt && doc.caseType === "customer_return") {
        return NextResponse.json(
          { message: "Chưa có xác nhận hàng hoàn đã về kho" },
          { status: 409 },
        );
      }
      const finalFault = isDecidableFault(doc.finalFaultParty)
        ? doc.finalFaultParty
        : doc.caseType === "delivery_failure"
          ? "carrier"
          : null;
      if (!finalFault) {
        return NextResponse.json(
          { message: "Yêu cầu chưa có kết luận bên chịu trách nhiệm" },
          { status: 409 },
        );
      }

      const outcome = await withReturnTransaction(async (dbSession) => {
        const txOrder = await Order.findById(doc.order).session(dbSession);
        if (!txOrder) {
          throw new ReturnOperationError(
            "Không tìm thấy đơn hàng của yêu cầu",
            404,
          );
        }
        const breakdown = computeCaseRefund(
          txOrder,
          finalFault,
          returnShippingDeductionFor(doc),
        );
        const noRefund = resolvesWithoutRefund({
          isPaid: txOrder.isPaid,
          amount: breakdown.amount,
        });
        const txSet: Record<string, unknown> = {
          inspection: {
            result: "accepted",
            note: reason || undefined,
            disposition,
            actor: vendorId,
            at: now,
          },
          finalFaultParty: finalFault,
          resolution: noRefund ? "no_refund" : "return_and_refund",
        };
        if (!noRefund) Object.assign(txSet, refundPendingSet(breakdown));

        const result = await transitionReturn({
          id: doc._id,
          from,
          action: noRefund ? "resolve_no_refund" : action,
          role: "vendor",
          actorId: vendorId,
          reason: reason || undefined,
          set: txSet,
          session: dbSession,
        });
        if (result.ok) {
          await finalizeReturnedOrder(
            txOrder,
            {
              source: doc.caseType,
              disposition,
              refundAmount: noRefund ? 0 : breakdown.amount,
            },
            dbSession,
          );
        }
        return { result, breakdown, noRefund };
      });

      if (!outcome.result.ok) {
        const mapped = transitionErrorResponse(outcome.result.error);
        return NextResponse.json(
          { message: mapped.message },
          { status: mapped.status },
        );
      }

      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: outcome.noRefund ? "resolved_no_refund" : "refund_pending",
      });

      return NextResponse.json(
        {
          message: outcome.noRefund
            ? "Đã nhận hàng hoàn. Đơn chưa thanh toán nên không phát sinh hoàn tiền."
            : "Đã nhận hàng hoàn, chờ admin xác nhận hoàn tiền",
          status: outcome.result.to,
          refund: outcome.noRefund ? null : outcome.breakdown,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      { message: "Hành động không hợp lệ" },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof ReturnOperationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    if (error instanceof StockRestoreError) {
      return NextResponse.json(
        {
          message: `${error.message}. Chá»n "Há»ng - khÃ´ng nháº­p kho" Ä‘á»ƒ chá»‘t mÃ  khÃ´ng cá»™ng tá»“n.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: `Không cập nhật được yêu cầu: ${error}` },
      { status: 500 },
    );
  }
}
