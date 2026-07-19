import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { cancelGHNOrder } from "@/lib/ghn";
import { collectEvidence, discardEvidence } from "@/lib/returns/evidence";
import { notifyReturnEvent } from "@/lib/returns/mail";
import {
  availableActionsFor,
  canConfirmReadyForPickup,
  type ActorRole,
} from "@/lib/returns/policy";
import {
  transitionErrorResponse,
  transitionReturn,
} from "@/lib/returns/transition";
import ReturnRequest, {
  type IReturnRequest,
  type ReturnStatus,
} from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

// Buyer chỉ được thực hiện đúng 4 hành động này; approve/reject/inspection là
// của vendor/admin (route riêng).
const BUYER_ACTIONS = [
  "appeal",
  "accept_rejection",
  "buyer_cancel",
  "submit_manual_shipment",
  // Không đổi status — chỉ ghi nhận buyer đã đóng gói xong. Xử lý ở nhánh riêng, KHÔNG
  // đi qua transition engine.
  "confirm_ready_for_pickup",
] as const;
type BuyerAction = (typeof BUYER_ACTIONS)[number];

// Xác định vai của người gọi ĐỐI VỚI case này (không tin role trong session cho
// buyer/vendor — phải khớp chủ sở hữu case).
function resolveRole(
  doc: IReturnRequest,
  userId: string,
  sessionRole?: string,
): ActorRole | null {
  if (String(doc.buyer) === userId) return "buyer";
  if (String(doc.vendor) === userId) return "vendor";
  if (sessionRole === "admin") return "admin";
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const doc = await ReturnRequest.findById(id)
      .populate(
        "order",
        "products totalAmount orderStatus deliveryDate refundStatus returnedAmount isPaid",
      )
      .lean<IReturnRequest | null>();
    if (!doc) {
      return NextResponse.json(
        { message: "Không tìm thấy yêu cầu" },
        { status: 404 },
      );
    }

    const role = resolveRole(doc, userId, session?.user?.role);
    if (!role) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Hành động hợp lệ tính theo ĐÚNG vai của người đang xem (buyer/vendor/admin được
    // làm những việc khác nhau trên cùng một case).
    const availableActions = availableActionsFor({
      status: doc.status,
      role,
      shippingMode: doc.shipping?.mode,
      hasGhnOrder: !!doc.shipping?.ghn?.orderCode,
      escalationStage: doc.escalation?.stage,
      orderIsPaid: (doc.order as { isPaid?: boolean } | undefined)?.isPaid,
      hasBuyerReadyConfirmation: !!doc.shipping?.buyerReadyAt,
      shipmentDeadlinePassed: doc.deadlines?.shipment
        ? new Date() > new Date(doc.deadlines.shipment)
        : false,
    });

    return NextResponse.json(
      { returnRequest: doc, role, availableActions },
      { status: 200 },
    );
  } catch (error) {
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
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const form = await req.formData();
    const action = String(form.get("action") ?? "") as BuyerAction;
    const reason = String(form.get("reason") ?? "").trim();

    if (!BUYER_ACTIONS.includes(action)) {
      return NextResponse.json(
        { message: "Hành động không hợp lệ" },
        { status: 400 },
      );
    }

    const doc = await ReturnRequest.findById(id).select(
      "buyer vendor status deadlines shipping vendorDecision",
    );
    if (!doc) {
      return NextResponse.json(
        { message: "Không tìm thấy yêu cầu" },
        { status: 404 },
      );
    }

    const role = resolveRole(doc as IReturnRequest, userId, session?.user?.role);
    if (role !== "buyer") {
      return NextResponse.json(
        { message: "Chỉ người mua của yêu cầu này mới thao tác được" },
        { status: 403 },
      );
    }

    const from = doc.status as ReturnStatus;
    const now = new Date();
    const shipmentDeadlinePassed = doc.deadlines?.shipment
      ? now > new Date(doc.deadlines.shipment)
      : false;
    const set: Record<string, unknown> = {};
    let uploadedEvidence: { publicIds: string[] } | null = null;

    // ── Xác nhận đã đóng gói, sẵn sàng bàn giao (vận đơn GHN) ───────────────────────
    // KHÔNG đổi status — chỉ ghi mốc buyerReadyAt để bên lấy hàng biết được phép đến lấy.
    // Xử lý TRƯỚC cổng `allowed` vì action này không nằm trong bảng transition, và phải
    // IDEMPOTENT: gọi lại khi đã xác nhận vẫn trả 200 mà không thêm history trùng.
    if (action === "confirm_ready_for_pickup") {
      if (doc.shipping?.buyerReadyAt) {
        return NextResponse.json(
          { message: "Đã ghi nhận bạn sẵn sàng bàn giao", status: doc.status },
          { status: 200 },
        );
      }
      const deadline = doc.deadlines?.shipment;
      const canConfirm = canConfirmReadyForPickup({
        status: from,
        role: "buyer",
        shippingMode: doc.shipping?.mode,
        hasGhnOrder: !!doc.shipping?.ghn?.orderCode,
        shipmentDeadlinePassed: deadline ? now > new Date(deadline) : false,
      });
      if (!canConfirm) {
        return NextResponse.json(
          {
            message:
              "Chưa thể xác nhận sẵn sàng bàn giao ở trạng thái hiện tại của yêu cầu",
          },
          { status: 409 },
        );
      }
      // CAS trên "buyerReadyAt chưa tồn tại": hai lần bấm / hai request song song thì chỉ
      // MỘT lần ghi được history; các lần sau rơi vào nhánh idempotent bên dưới.
      const updated = await ReturnRequest.findOneAndUpdate(
        {
          _id: doc._id,
          status: "awaiting_return_shipment",
          "shipping.mode": "ghn",
          "shipping.ghn.orderCode": { $exists: true, $ne: null },
          "shipping.buyerReadyAt": { $exists: false },
        },
        {
          $set: { "shipping.buyerReadyAt": now },
          $push: {
            history: {
              actor: userId,
              role: "buyer",
              action: "confirm_ready_for_pickup",
              fromStatus: from,
              toStatus: from, // giữ nguyên awaiting_return_shipment
              at: now,
            },
          },
        },
        { returnDocument: "after" },
      );
      if (!updated) {
        // Ai đó vừa ghi trước (race): nếu buyerReadyAt đã có thì vẫn coi là thành công.
        const fresh = await ReturnRequest.findById(doc._id).select(
          "status shipping.buyerReadyAt",
        );
        if (fresh?.shipping?.buyerReadyAt) {
          return NextResponse.json(
            {
              message: "Đã ghi nhận bạn sẵn sàng bàn giao",
              status: fresh.status,
            },
            { status: 200 },
          );
        }
        return NextResponse.json(
          {
            message:
              "Chưa thể xác nhận sẵn sàng bàn giao ở trạng thái hiện tại của yêu cầu",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          message: "Đã ghi nhận bạn sẵn sàng bàn giao, chờ GHN đến lấy hàng",
          status: updated.status,
        },
        { status: 200 },
      );
    }

    const allowed = availableActionsFor({
      status: from,
      role: "buyer",
      shippingMode: doc.shipping?.mode,
      hasGhnOrder: !!doc.shipping?.ghn?.orderCode,
      shipmentDeadlinePassed,
    });
    if (!allowed.includes(action)) {
      return NextResponse.json(
        { message: "Hành động không hợp lệ ở trạng thái hiện tại" },
        { status: 409 },
      );
    }

    if (action === "appeal") {
      if (!reason) {
        return NextResponse.json(
          { message: "Vui lòng nêu lý do khiếu nại" },
          { status: 400 },
        );
      }
      const deadline = doc.deadlines?.appeal;
      if (deadline && now > new Date(deadline)) {
        return NextResponse.json(
          { message: "Đã hết hạn khiếu nại cho yêu cầu này" },
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
      uploadedEvidence = evidence;
      set.appeal = {
        reason,
        evidence: evidence.urls,
        deadline: doc.deadlines?.appeal,
        at: now,
      };
    }

    if (action === "submit_manual_shipment") {
      if (shipmentDeadlinePassed) {
        return NextResponse.json(
          { message: "Đã hết hạn gửi hàng cho yêu cầu này" },
          { status: 409 },
        );
      }
      const carrier = String(form.get("carrier") ?? "").trim();
      const trackingCode = String(form.get("trackingCode") ?? "").trim();
      if (!carrier || !trackingCode) {
        return NextResponse.json(
          { message: "Vui lòng nhập hãng vận chuyển và mã vận đơn" },
          { status: 400 },
        );
      }
      // Ảnh biên nhận là TUỲ CHỌN (buyer có thể chưa kịp chụp) nhưng nếu có thì validate
      // như mọi ảnh khác. Upload xong mà transition hỏng thì dọn qua uploadedEvidence.
      const evidence = await collectEvidence(form);
      if ("error" in evidence) {
        return NextResponse.json(
          { message: evidence.error.message },
          { status: 400 },
        );
      }
      uploadedEvidence = evidence;
      set["shipping.mode"] = "manual";
      set["shipping.carrier"] = carrier;
      set["shipping.trackingCode"] = trackingCode;
      set["shipping.status"] = "in_transit";
      // Mốc duy nhất chứng minh buyer đã gửi hàng — vận đơn tự khai không có GHN đẩy
      // sự kiện, và cron dùng mốc này để biết case treo bao lâu.
      set["shipping.submittedAt"] = now;
      if (evidence.urls.length) {
        set["shipping.handoverEvidence"] = evidence.urls;
      }
    }

    // ── Huỷ yêu cầu: KẾT QUẢ HUỶ VẬN ĐƠN GHN QUYẾT ĐỊNH có được đổi trạng thái không.
    // Huỷ trạng thái trước rồi mới gọi GHN là sai: nếu GHN đã lấy hàng, case đã "huỷ"
    // nhưng kiện hàng vẫn đang về kho vendor — kho và trạng thái lệch nhau. Vì vậy gọi
    // GHN TRƯỚC, chỉ transition khi GHN xác nhận đã huỷ (hoặc chưa từng có vận đơn).
    const ghnCode = doc.shipping?.ghn?.orderCode;
    if (action === "buyer_cancel" && ghnCode) {
      const outcome = await cancelGHNOrder(ghnCode);
      if (outcome === "temporary_failure") {
        // Chưa biết huỷ được hay chưa — không đổi gì, để buyer thử lại.
        return NextResponse.json(
          {
            message:
              "Đơn vị vận chuyển đang tạm thời không phản hồi, vui lòng thử huỷ lại sau",
          },
          { status: 503 },
        );
      }
      if (outcome === "not_cancellable") {
        // Đã lấy hàng: không huỷ được nữa, kiện hàng sẽ về kho vendor như trả bình thường.
        return NextResponse.json(
          {
            message:
              "Không thể huỷ vì đơn vị vận chuyển đã lấy hàng. Yêu cầu sẽ tiếp tục như trả hàng bình thường.",
          },
          { status: 409 },
        );
      }
      // cancelled → ghi trạng thái vận đơn vào cùng transition bên dưới.
      set["shipping.status"] = "cancelled";
    }

    let result;
    try {
      result = await transitionReturn({
        id: doc._id,
        from,
        action,
        role: "buyer",
        actorId: userId,
        reason: reason || undefined,
        set,
        escalation:
          action === "appeal"
            ? {
                stage:
                  doc.vendorDecision?.stage === "inspection"
                    ? "inspection"
                    : "vendor_review",
                reason: "buyer_appeal",
              }
            : undefined,
        push:
          action === "buyer_cancel" && ghnCode
            ? { "shipping.statusLog": { status: "cancelled", time: now } }
            : undefined,
      });
    } catch (error) {
      await discardEvidence(uploadedEvidence);
      throw error;
    }

    if (!result.ok) {
      if (action === "buyer_cancel" && ghnCode) {
        const fresh = await ReturnRequest.findById(doc._id).select("status");
        if (
          fresh?.status === "awaiting_return_shipment" ||
          fresh?.status === "return_in_transit"
        ) {
          const reconciled = await transitionReturn({
            id: doc._id,
            from: fresh.status,
            action: "carrier_cancelled",
            role: "system",
            reason: "GHN đã xác nhận hủy vận đơn",
            set: { "shipping.status": "cancelled" },
            push: {
              "shipping.statusLog": { status: "cancelled", time: now },
            },
          });
          if (reconciled.ok) {
            return NextResponse.json(
              { message: "Đã hủy yêu cầu", status: reconciled.to },
              { status: 200 },
            );
          }
        }
      }
      await discardEvidence(uploadedEvidence);
      const mapped = transitionErrorResponse(result.error);
      return NextResponse.json(
        { message: mapped.message },
        { status: mapped.status },
      );
    }

    if (action === "appeal") {
      await notifyReturnEvent({
        returnRequestId: doc._id,
        event: "escalated",
        note: reason,
      });
    }

    return NextResponse.json(
      { message: "Đã cập nhật yêu cầu", status: result.to },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Không cập nhật được yêu cầu: ${error}` },
      { status: 500 },
    );
  }
}
