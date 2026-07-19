import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { availableActionsFor } from "@/lib/returns/policy";
import ReturnRequest, {
  type EscalationStage,
  type ReturnStatus,
} from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

// Queue hoàn trả của vendor. Luôn ràng buộc vendor = người đang đăng nhập.
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;

    const status = req.nextUrl.searchParams.get("status");
    const filter: Record<string, unknown> = { vendor: session.user.id };
    if (status && status !== "all") filter.status = status;

    const returns = await ReturnRequest.find(filter)
      .populate("order", "totalAmount orderStatus deliveryDate products isPaid")
      .populate("buyer", "name email")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // Hành động hợp lệ do server quyết định — UI chỉ render, không tự suy luận.
    // Nhờ vậy nút "Xác nhận đã nhận hàng" chỉ hiện với vận đơn tự khai.
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
          role: "vendor",
          shippingMode: doc.shipping?.mode,
          escalationStage: doc.escalation?.stage,
          orderIsPaid: doc.order?.isPaid,
        }),
      }),
    );

    return NextResponse.json({ returns: rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Không tải được danh sách hoàn trả: ${error}` },
      { status: 500 },
    );
  }
}
