import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { ensureReturnShipment } from "@/lib/returns/shipping";
import ReturnRequest from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

// POST /api/vendor/returns/[id]/shipping — tạo lại vận đơn hoàn khi lần duyệt trước gọi
// GHN thất bại (retry_shipping_creation).
//
// An toàn khi bấm nhiều lần: ensureReturnShipment idempotent theo client_order_code
// "RET-<id>" — đã có vận đơn thì trả lại đúng vận đơn đó chứ không tạo thêm.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;

    const { id } = await params;
    // Ownership: chỉ case của chính vendor này.
    const doc = await ReturnRequest.findOne({
      _id: id,
      vendor: session.user.id,
    }).select("_id");
    if (!doc) {
      return NextResponse.json(
        { message: "Không tìm thấy yêu cầu" },
        { status: 404 },
      );
    }

    const shipment = await ensureReturnShipment(doc._id);
    if (!shipment.ok) {
      return NextResponse.json(
        { message: shipment.error },
        // 502: GHN lỗi, thử lại được. 409: sai trạng thái/thiếu địa chỉ — thử lại vô ích.
        { status: shipment.retryable ? 502 : 409 },
      );
    }

    return NextResponse.json(
      {
        message: shipment.alreadyExisted
          ? "Vận đơn hoàn đã có sẵn"
          : "Đã tạo vận đơn hoàn",
        orderCode: shipment.orderCode,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Không tạo được vận đơn hoàn: ${error}` },
      { status: 500 },
    );
  }
}
