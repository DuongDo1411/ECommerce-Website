import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { notifyReturnEvent } from "@/lib/returns/mail";
import {
  transitionErrorResponse,
  transitionReturn,
} from "@/lib/returns/transition";
import {
  ReturnOperationError,
  withReturnTransaction,
} from "@/lib/returns/transaction";
import Order from "@/model/order.model";
import ReturnRequest from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

const REFUND_ACTIONS = [
  "mark_processed",
  "mark_failed",
  "retry_refund",
] as const;
type RefundAction = (typeof REFUND_ACTIONS)[number];

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
    const action = String(body.action ?? "") as RefundAction;
    const method = String(body.method ?? "").trim();
    const reference = String(body.reference ?? "").trim();
    const note = String(body.note ?? "").trim();

    if (!REFUND_ACTIONS.includes(action)) {
      return NextResponse.json(
        { message: "Hành động không hợp lệ" },
        { status: 400 },
      );
    }
    if (action === "mark_processed" && (!method || !reference || !note)) {
      return NextResponse.json(
        { message: "Cần đủ phương thức, mã tham chiếu và ghi chú" },
        { status: 400 },
      );
    }
    if (action === "mark_failed" && !note) {
      return NextResponse.json(
        { message: "Cần ghi chú lý do hoàn tiền thất bại" },
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

      const amount = doc.refund?.amount ?? 0;
      if (
        !order.isPaid ||
        amount <= 0 ||
        order.returnedAmount !== amount
      ) {
        throw new ReturnOperationError(
          "Dữ liệu khoản hoàn không hợp lệ hoặc không đồng bộ với đơn hàng",
          409,
        );
      }

      const now = new Date();
      const set: Record<string, unknown> = {};
      let orderRefundStatus: "processed" | "failed" | "pending";
      if (action === "mark_processed") {
        Object.assign(set, {
          "refund.method": method,
          "refund.reference": reference,
          "refund.note": note,
          "refund.status": "processed",
          "refund.processedBy": adminId,
          "refund.processedAt": now,
        });
        orderRefundStatus = "processed";
      } else if (action === "mark_failed") {
        Object.assign(set, {
          "refund.note": note,
          "refund.status": "failed",
          "refund.processedBy": adminId,
          "refund.processedAt": now,
        });
        orderRefundStatus = "failed";
      } else {
        set["refund.status"] = "pending";
        orderRefundStatus = "pending";
      }

      const result = await transitionReturn({
        id: doc._id,
        from: doc.status,
        action,
        role: "admin",
        actorId: adminId,
        reason: note || undefined,
        set,
        session: dbSession,
      });
      if (result.ok) {
        order.refundStatus = orderRefundStatus;
        await order.save({ session: dbSession });
      }
      return { result, docId: doc._id };
    });

    if (!outcome.result.ok) {
      const mapped = transitionErrorResponse(outcome.result.error);
      return NextResponse.json(
        { message: mapped.message },
        { status: mapped.status },
      );
    }

    if (action === "mark_processed" || action === "mark_failed") {
      await notifyReturnEvent({
        returnRequestId: outcome.docId,
        event: action === "mark_processed" ? "refunded" : "refund_failed",
        note: note || undefined,
      });
    }

    return NextResponse.json(
      { message: "Đã cập nhật hoàn tiền", status: outcome.result.to },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ReturnOperationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { message: `Không cập nhật được hoàn tiền: ${error}` },
      { status: 500 },
    );
  }
}
