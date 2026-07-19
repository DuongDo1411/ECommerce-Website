import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
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
  type StockDisposition,
} from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_ACTIONS = [
  "approve_return",
  "approve_refund_only",
  "approve_received_return",
  "resolve_no_refund",
  "reject",
] as const;
type AdminAction = (typeof ADMIN_ACTIONS)[number];

const RECEIVED_DISPOSITIONS: StockDisposition[] = [
  "restock",
  "damaged",
  "quarantine",
];
const NO_STOCK_DISPOSITIONS: StockDisposition[] = [
  "damaged",
  "lost",
  "quarantine",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const adminId = authz.session.user.id;

    const { id } = await params;
    const body = await req.json();
    const action = String(body.action ?? "") as AdminAction;
    const reason = String(body.reason ?? "").trim();
    const fault = String(body.faultParty ?? "") as FaultParty;
    const requestedDisposition = String(
      body.disposition ?? "",
    ) as StockDisposition;

    if (!ADMIN_ACTIONS.includes(action)) {
      return NextResponse.json(
        { message: "Hành động không hợp lệ" },
        { status: 400 },
      );
    }
    if (!reason) {
      return NextResponse.json(
        { message: "Phán quyết phải kèm lý do" },
        { status: 400 },
      );
    }
    if (action !== "reject" && !isDecidableFault(fault)) {
      return NextResponse.json(
        { message: "Phải kết luận người bán, người mua hoặc đơn vị vận chuyển chịu trách nhiệm" },
        { status: 400 },
      );
    }

    const outcome = await withReturnTransaction(async (dbSession) => {
      const doc = await ReturnRequest.findById(id).session(dbSession);
      if (!doc) throw new ReturnOperationError("Không tìm thấy yêu cầu", 404);
      const order = await Order.findById(doc.order).session(dbSession);
      if (!order) {
        throw new ReturnOperationError(
          "Không tìm thấy đơn hàng của yêu cầu",
          404,
        );
      }

      const allowed = availableActionsFor({
        status: doc.status,
        role: "admin",
        shippingMode: doc.shipping?.mode,
        escalationStage: doc.escalation?.stage,
        orderIsPaid: order.isPaid,
      });
      if (!allowed.includes(action)) {
        throw new ReturnOperationError(
          "Phán quyết không phù hợp với giai đoạn xử lý hiện tại",
          409,
        );
      }

      const now = new Date();
      const set: Record<string, unknown> = {
        adminDecision: { action, reason, actor: adminId, at: now },
      };
      if (action !== "reject") set.finalFaultParty = fault;

      let breakdown: ReturnType<typeof computeCaseRefund> | null = null;
      let disposition: StockDisposition | undefined;

      if (action === "reject") set.resolution = "rejected";

      if (action === "approve_return") {
        set.resolution = "return_and_refund";
        set["shipping.payer"] = returnShippingPayer(fault);
        set["shipping.status"] = "creating";
        set["deadlines.shipment"] = addDays(now, DEADLINE_DAYS.shipment);
      }

      if (
        action === "approve_refund_only" ||
        action === "approve_received_return"
      ) {
        breakdown = computeCaseRefund(
          order,
          fault,
          returnShippingDeductionFor(doc),
        );
        if (
          resolvesWithoutRefund({
            isPaid: order.isPaid,
            amount: breakdown.amount,
          })
        ) {
          throw new ReturnOperationError(
            "Đơn không có khoản tiền để hoàn; hãy dùng quyết định không phát sinh hoàn tiền",
            409,
          );
        }
        set.resolution =
          action === "approve_refund_only"
            ? "refund_only"
            : "return_and_refund";
        Object.assign(set, refundPendingSet(breakdown));
      }

      if (action === "approve_received_return") {
        if (!doc.shipping?.receivedAt) {
          throw new ReturnOperationError(
            "Chưa có xác nhận hàng đã về kho",
            409,
          );
        }
        disposition = RECEIVED_DISPOSITIONS.includes(requestedDisposition)
          ? requestedDisposition
          : "damaged";
        set.inspection = {
          result: "accepted",
          note: reason,
          disposition,
          actor: adminId,
          at: now,
        };
      }

      if (action === "resolve_no_refund") {
        if (order.isPaid) {
          throw new ReturnOperationError(
            "Đơn đã thanh toán nên không thể đóng theo hướng không hoàn tiền",
            409,
          );
        }
        set.resolution = "no_refund";
        if (doc.escalation?.stage === "inspection") {
          if (!doc.shipping?.receivedAt) {
            throw new ReturnOperationError(
              "Chưa có xác nhận hàng đã về kho",
              409,
            );
          }
          disposition = RECEIVED_DISPOSITIONS.includes(requestedDisposition)
            ? requestedDisposition
            : "damaged";
          set.inspection = {
            result: "accepted",
            note: reason,
            disposition,
            actor: adminId,
            at: now,
          };
        } else {
          disposition = NO_STOCK_DISPOSITIONS.includes(requestedDisposition)
            ? requestedDisposition
            : "lost";
        }
      }

      const result = await transitionReturn({
        id: doc._id,
        from: doc.status,
        action,
        role: "admin",
        actorId: adminId,
        reason,
        set,
        session: dbSession,
      });
      if (!result.ok) return { result, breakdown, docId: doc._id };

      if (action === "approve_refund_only" && breakdown) {
        order.returnedAmount = breakdown.amount;
        order.refundStatus = "pending";
        await order.save({ session: dbSession });
      }

      if (
        (action === "approve_received_return" ||
          action === "resolve_no_refund") &&
        disposition
      ) {
        await finalizeReturnedOrder(
          order,
          {
            source: doc.caseType,
            disposition,
            refundAmount:
              action === "approve_received_return" && breakdown
                ? breakdown.amount
                : 0,
          },
          dbSession,
        );
      }

      return { result, breakdown, docId: doc._id };
    });

    if (!outcome.result.ok) {
      const mapped = transitionErrorResponse(outcome.result.error);
      return NextResponse.json(
        { message: mapped.message },
        { status: mapped.status },
      );
    }

    const shipment =
      action === "approve_return"
        ? await ensureReturnShipment(outcome.docId)
        : null;
    const mailEvent =
      action === "reject"
        ? "rejected"
        : action === "approve_return"
          ? "approved_return"
          : action === "resolve_no_refund"
            ? "resolved_no_refund"
            : "refund_pending";
    await notifyReturnEvent({
      returnRequestId: outcome.docId,
      event: mailEvent,
      note: reason,
    });

    return NextResponse.json(
      {
        message: "Đã ghi nhận phán quyết",
        status: outcome.result.to,
        ...(outcome.breakdown ? { refund: outcome.breakdown } : {}),
        ...(shipment
          ? {
              shipping: shipment.ok
                ? { orderCode: shipment.orderCode }
                : { error: shipment.error },
            }
          : {}),
      },
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
          message: `${error.message}. Chọn phương án không nhập kho để tiếp tục.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { message: `Không ghi được phán quyết: ${error}` },
      { status: 500 },
    );
  }
}
