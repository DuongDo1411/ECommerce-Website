import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { getPrintUrl } from "@/lib/ghn";
import ReturnRequest, {
  type IReturnRequest,
} from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

// GET /api/returns/[id]/label — chỉ CHỦ CASE (buyer) mới lấy được URL in nhãn GHN.
//
// Nhãn in chứa tên/địa chỉ/SĐT của cả hai đầu, nên tuyệt đối không được lộ cho người
// ngoài case. Token in do GHN cấp theo mã vận đơn và hết hạn ngắn, vì vậy sinh MỖI LẦN
// theo yêu cầu thay vì lưu sẵn.
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
      .select("buyer shipping.ghn.orderCode")
      .lean<Pick<IReturnRequest, "buyer" | "shipping"> | null>();
    if (!doc) {
      return NextResponse.json(
        { message: "Không tìm thấy yêu cầu" },
        { status: 404 },
      );
    }
    // Chỉ chủ đơn: so trực tiếp buyer của case, không tin role trong session.
    if (String(doc.buyer) !== userId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const orderCode = doc.shipping?.ghn?.orderCode;
    if (!orderCode) {
      return NextResponse.json(
        { message: "Yêu cầu chưa có vận đơn GHN để in nhãn" },
        { status: 409 },
      );
    }

    try {
      const url = await getPrintUrl(orderCode);
      return NextResponse.json({ url }, { status: 200 });
    } catch (err) {
      // GHN không cấp được token in (mạng/sandbox) → 502 để UI báo "thử lại", phân biệt
      // với 500 do lỗi nội bộ của mình.
      return NextResponse.json(
        { message: `Không lấy được nhãn từ GHN: ${err}` },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { message: `Không lấy được nhãn: ${error}` },
      { status: 500 },
    );
  }
}
