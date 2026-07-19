import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { applyReturnShipmentEvent } from "@/lib/returns/ghnEvents";
import ReturnRequest from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

const SIMULATABLE_STATUSES = ["picked", "delivered"] as const;

// POST /api/dev/ghn/returns/[id]/simulate   body: { status: "delivered" }
//
// Trên sandbox GHN kiện hàng không di chuyển thật nên GHN không bao giờ đẩy webhook
// "picked"/"delivered" — nhánh tự động không có cách nào chạy để demo. Endpoint này bơm
// thẳng sự kiện vào ĐÚNG hàm mà webhook dùng, nên đường đi của dữ liệu giống hệt thật,
// chỉ bỏ bước hỏi lại GHN (vận đơn sandbox thì có hỏi cũng không thấy).
//
// KHÓA HAI LỚP: tắt hẳn ở production, và chỉ admin hoặc chủ cron gọi được. Thiếu hai
// lớp này thì đây là cửa hậu cho phép bất kỳ ai tự tuyên bố hàng hoàn đã về kho.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  try {
    await connectDB();

    const secret = req.headers.get("x-cron-secret");
    const hasSecret =
      !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
    if (!hasSecret) {
      const session = await auth();
      if (session?.user?.role !== "admin") {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const status = String(body.status ?? "").trim();
    if (!SIMULATABLE_STATUSES.includes(status as (typeof SIMULATABLE_STATUSES)[number])) {
      return NextResponse.json(
        { message: "Chỉ được mô phỏng trạng thái picked hoặc delivered" },
        { status: 400 },
      );
    }

    const doc = await ReturnRequest.findById(id)
      .select("status shipping.mode shipping.buyerReadyAt shipping.ghn.orderCode")
      .lean();
    if (!doc) {
      return NextResponse.json(
        { message: "Không tìm thấy yêu cầu hoàn trả" },
        { status: 404 },
      );
    }
    if (doc.shipping?.mode !== "ghn" || !doc.shipping?.ghn?.orderCode) {
      return NextResponse.json(
        { message: "Công cụ mô phỏng chỉ áp dụng cho vận đơn hoàn GHN" },
        { status: 409 },
      );
    }

    if (status === "picked") {
      if (doc.status !== "awaiting_return_shipment") {
        return NextResponse.json(
          { message: "Chỉ mô phỏng lấy hàng khi case đang chờ bàn giao" },
          { status: 409 },
        );
      }
      if (!doc.shipping?.buyerReadyAt) {
        return NextResponse.json(
          { message: "Người mua chưa xác nhận sẵn sàng bàn giao" },
          { status: 409 },
        );
      }
    }

    if (status === "delivered" && doc.status !== "return_in_transit") {
      return NextResponse.json(
        { message: "Chỉ mô phỏng giao hàng sau khi GHN đã lấy kiện" },
        { status: 409 },
      );
    }

    const simulatedTime = body.time ? new Date(body.time) : new Date();
    if (Number.isNaN(simulatedTime.getTime())) {
      return NextResponse.json(
        { message: "Thời gian mô phỏng không hợp lệ" },
        { status: 400 },
      );
    }

    const result = await applyReturnShipmentEvent({
      returnRequestId: id,
      status,
      time: simulatedTime,
    });

    return NextResponse.json(
      { message: "Đã mô phỏng sự kiện GHN", simulated: status, ...result },
      { status: result.applied ? 200 : 409 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Không mô phỏng được: ${error}` },
      { status: 500 },
    );
  }
}
