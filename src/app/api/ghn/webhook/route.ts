import connectDB from "@/lib/connectDB";
import {
  getGHNOrderDetail,
  getGHNOrderDetailByClientCode,
  GHN_CONFIGURED_SHOP_ID,
  GHNError,
} from "@/lib/ghn";
import {
  applyOutboundOrderEvent,
  applyReturnShipmentEvent,
} from "@/lib/returns/ghnEvents";
import { parseReturnClientCode } from "@/lib/returns/shipping";
import Order from "@/model/order.model";
import ReturnRequest from "@/model/returnRequest.model";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

// POST /api/ghn/webhook — GHN đẩy thay đổi trạng thái vào đây.
//
// Endpoint PUBLIC: bất kỳ ai cũng POST được, nên KHÔNG tin body. Trạng thái luôn được
// hỏi lại chính GHN (Detail API) rồi mới áp dụng — nếu không, người ngoài có thể tự
// "giao hàng thành công" cho đơn của người khác, hoặc bịa sự kiện hàng hoàn đã về để ép
// hệ thống hoàn tiền.
//
// Quy ước mã trả về: 2xx = đã xử lý xong hoặc bỏ qua có chủ đích (GHN đừng gửi lại);
// 5xx = lỗi TẠM THỜI, mong GHN gửi lại. Không bao giờ trả 5xx cho sự kiện không hợp lệ,
// vì GHN sẽ retry mãi một thứ không bao giờ đúng được.

// Chỉ tắt được khi chạy local/demo với vận đơn giả không tồn tại trên GHN.
// Ở production KHÔNG có cách nào tắt: mất verify thì endpoint này thành cửa cho bất kỳ
// ai tự tuyên bố đơn đã giao / hàng hoàn đã về.
const VERIFY =
  process.env.NODE_ENV === "production" ||
  process.env.GHN_WEBHOOK_VERIFY !== "off";

// Lỗi có thể tự khỏi (GHN sập, rate limit, mạng, token sai chờ sửa) ⇒ đáng retry.
// Lỗi 400/404 nghĩa là vận đơn không tồn tại ⇒ retry vô nghĩa.
function isTransient(err: unknown): boolean {
  if (err instanceof GHNError) {
    return err.code >= 500 || err.code === 429 || err.code === 401;
  }
  return true; // lỗi mạng/parse
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));

    const orderCode: string | undefined = body.OrderCode;
    const clientOrderCode: string | undefined = body.ClientOrderCode;
    const claimedStatus: string | undefined = body.Status;
    const claimedTime = body.Time ? new Date(body.Time) : new Date();
    const time = Number.isNaN(claimedTime.getTime()) ? new Date() : claimedTime;

    if (!claimedStatus || (!orderCode && !clientOrderCode)) {
      return NextResponse.json({ message: "ignored" }, { status: 200 });
    }

    // ── Xác thực với GHN: lấy trạng thái VÀ danh tính THẬT của kiện hàng.
    //
    // Không đủ nếu chỉ xác thực status rồi vẫn định tuyến bằng ClientOrderCode trong
    // body: kẻ tấn công chỉ cần ghép mã vận đơn thật của chính mình với ClientOrderCode
    // của case người khác là lái được trạng thái sang case đó. Vì vậy từ đây trở xuống
    // chỉ dùng identity do GHN trả về.
    let status = claimedStatus;
    let verifiedOrderCode = orderCode;
    let verifiedClientCode = clientOrderCode;

    if (VERIFY) {
      try {
        if (!GHN_CONFIGURED_SHOP_ID) {
          console.error("[GHN webhook] thiếu GHN_SHOP_ID");
          return NextResponse.json(
            { message: "verification unavailable" },
            { status: 503 },
          );
        }
        const detail = orderCode
          ? await getGHNOrderDetail(orderCode)
          : await getGHNOrderDetailByClientCode(clientOrderCode!);
        if (
          !detail?.status ||
          !detail.order_code ||
          !detail.client_order_code ||
          detail.shop_id === undefined
        ) {
          return NextResponse.json(
            { message: "ignored: incomplete identity" },
            { status: 200 },
          );
        }

        // Kiện hàng phải thuộc shop của sàn.
        if (
          String(detail.shop_id) !== String(GHN_CONFIGURED_SHOP_ID)
        ) {
          console.warn(
            "[GHN webhook] TỪ CHỐI: shop_id không khớp",
            { claimed: orderCode, shopId: detail.shop_id },
          );
          return NextResponse.json(
            { message: "ignored: foreign shop" },
            { status: 200 },
          );
        }

        if (orderCode && orderCode !== detail.order_code) {
          console.warn("[GHN webhook] TỪ CHỐI: order_code không khớp", {
            body: orderCode,
            ghn: detail.order_code,
          });
          return NextResponse.json(
            { message: "ignored: identity mismatch" },
            { status: 200 },
          );
        }

        // Body khai client code thì phải trùng với client code GHN đang giữ.
        if (
          clientOrderCode &&
          clientOrderCode !== detail.client_order_code
        ) {
          console.warn(
            "[GHN webhook] TỪ CHỐI: client_order_code không khớp (nghi giả mạo)",
            { body: clientOrderCode, ghn: detail.client_order_code },
          );
          return NextResponse.json(
            { message: "ignored: identity mismatch" },
            { status: 200 },
          );
        }

        status = detail.status;
        verifiedOrderCode = detail.order_code;
        verifiedClientCode = detail.client_order_code;
      } catch (err) {
        if (isTransient(err)) {
          console.error("[GHN webhook] verify failed (transient):", err);
          return NextResponse.json(
            { message: "verification unavailable" },
            { status: 503 },
          );
        }
        return NextResponse.json(
          { message: "ignored: not found at GHN" },
          { status: 200 },
        );
      }
    }

    // ── Vận đơn CHIỀU NGƯỢC? Nhận diện qua client code "RET-<id>", hoặc tra mã vận đơn.
    const returnIdFromCode = parseReturnClientCode(verifiedClientCode);
    let returnRequestId: unknown = null;
    if (returnIdFromCode && mongoose.isValidObjectId(returnIdFromCode)) {
      const found = await ReturnRequest.findOne({
        _id: returnIdFromCode,
        "shipping.mode": "ghn",
        "shipping.ghn.orderCode": verifiedOrderCode,
      }).select("_id");
      if (found) returnRequestId = found._id;
    } else if (!VERIFY && verifiedOrderCode) {
      const found = await ReturnRequest.findOne({
        "shipping.ghn.orderCode": verifiedOrderCode,
      }).select("_id");
      if (found) returnRequestId = found._id;
    }

    if (returnRequestId) {
      const result = await applyReturnShipmentEvent({
        returnRequestId,
        status,
        time,
      });
      return NextResponse.json(
        { message: "ok", scope: "return", ...result },
        { status: 200 },
      );
    }

    // ── Vận đơn CHIỀU XUÔI. clientOrderCode = order._id; phải kiểm tra trước khi query
    // vì chuỗi rác sẽ làm Mongoose ném CastError.
    const filter =
      verifiedClientCode && mongoose.isValidObjectId(verifiedClientCode)
        ? { _id: verifiedClientCode, "ghn.orderCode": verifiedOrderCode }
        : !VERIFY && verifiedOrderCode
          ? { "ghn.orderCode": verifiedOrderCode }
          : null;
    if (!filter) {
      return NextResponse.json({ message: "ignored" }, { status: 200 });
    }

    const order = await Order.findOne(filter);
    if (!order) {
      return NextResponse.json(
        { message: "ignored: order not found" },
        { status: 200 },
      );
    }

    const result = await applyOutboundOrderEvent({ order, status, time });
    return NextResponse.json(
      { message: "ok", scope: "order", ...result },
      { status: 200 },
    );
  } catch (error) {
    // Lỗi phía mình (bug/DB) là tạm thời ⇒ để GHN gửi lại, đừng nuốt mất sự kiện.
    console.error("[GHN webhook] error:", error);
    return NextResponse.json({ message: "internal error" }, { status: 503 });
  }
}
