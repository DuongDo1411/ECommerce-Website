import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { availableActionsFor } from "@/lib/returns/policy";
import ReturnRequest, {
  type EscalationStage,
  type ReturnStatus,
} from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

// Queue trọng tài + hoàn tiền của admin.
// Mặc định trả các case cần admin xử lý: khiếu nại và hoàn tiền.
const ADMIN_QUEUE = ["escalated", "refund_pending", "refund_failed"];

// Bộ lọc "Vận chuyển hoàn": các case đang trên đường hoàn về — dùng cho công cụ mô phỏng
// GHN lấy/giao ở môi trường dev (sandbox không tự đẩy webhook).
const RETURN_SHIPPING = ["awaiting_return_shipment", "return_in_transit"];

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;

    const status = req.nextUrl.searchParams.get("status");
    let filter: Record<string, unknown>;
    if (!status) {
      filter = { status: { $in: ADMIN_QUEUE } };
    } else if (status === "all") {
      filter = {};
    } else if (status === "return_shipping") {
      filter = { status: { $in: RETURN_SHIPPING } };
    } else {
      filter = { status };
    }

    const returns = await ReturnRequest.find(filter)
      .populate(
        "order",
        "totalAmount serviceCharge deliveryCharge freeshipDiscount orderStatus refundStatus returnedAmount isPaid",
      )
      .populate("buyer", "name email")
      .populate("vendor", "name email shopName")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // Gắn sẵn hành động hợp lệ cho từng case: admin được làm gì phụ thuộc GIAI ĐOẠN leo
    // thang, nên UI không thể tự suy ra chỉ từ status.
    const rows = returns.map(
      (doc: {
        status: ReturnStatus;
        shipping?: { mode?: string };
        escalation?: { stage?: EscalationStage };
        order?: { isPaid?: boolean };
      }) => ({
        ...doc,
        availableActions: availableActionsFor({
          status: doc.status,
          role: "admin",
          shippingMode: doc.shipping?.mode,
          escalationStage: doc.escalation?.stage,
          orderIsPaid: doc.order?.isPaid,
        }),
      }),
    );

    return NextResponse.json({ returns: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Không tải được danh sách: ${error}` },
      { status: 500 },
    );
  }
}
