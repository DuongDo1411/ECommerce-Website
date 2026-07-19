import connectDB from "@/lib/connectDB";
import { cancelGHNOrder } from "@/lib/ghn";
import { addDays, DEADLINE_DAYS } from "@/lib/returns/policy";
import { ensureReturnShipment } from "@/lib/returns/shipping";
import {
  notifyReturnEvent,
  type ReturnMailEvent,
} from "@/lib/returns/mail";
import { transitionReturn } from "@/lib/returns/transition";
import ReturnRequest, { type ReturnStatus } from "@/model/returnRequest.model";
import { NextRequest, NextResponse } from "next/server";

// POST /api/cron/process-returns   header: x-cron-secret: <CRON_SECRET>
// Chạy định kỳ (khuyến nghị 15 phút/lần).
//
// Không có cron thì case sẽ kẹt vĩnh viễn mỗi khi một bên im lặng: vendor không duyệt,
// buyer không gửi hàng, vendor không kiểm định, buyer không khiếu nại. Mỗi mốc hạn ở đây
// là một lối thoát cho case, luôn nghiêng về phía không bắt người mua chờ vô hạn.
//
// Mọi chuyển trạng thái đều đi qua transition engine với role "system": vẫn bị bảng
// state-machine kiểm tra và vẫn CAS, nên hai lần chạy chồng nhau không làm hỏng dữ liệu.

interface SweepResult {
  scanned: number;
  applied: number;
}

async function sweep(
  filter: Record<string, unknown>,
  from: ReturnStatus,
  action: string,
  reason: string,
  mailEvent?: ReturnMailEvent,
): Promise<SweepResult> {
  const docs = await ReturnRequest.find({ status: from, ...filter })
    .select("_id")
    .limit(200)
    .lean();

  let applied = 0;
  for (const doc of docs) {
    const res = await transitionReturn({
      id: doc._id,
      from,
      action,
      role: "system",
      reason,
    });
    if (res.ok) {
      applied++;
      if (mailEvent) {
        await notifyReturnEvent({
          returnRequestId: doc._id,
          event: mailEvent,
          note: reason,
        });
      }
    }
  }
  return { scanned: docs.length, applied };
}

async function sweepExpiredShipments(now: Date): Promise<SweepResult> {
  const docs = await ReturnRequest.find({
    status: "awaiting_return_shipment",
    "deadlines.shipment": { $lt: now },
  })
    .select("_id shipping.ghn.orderCode")
    .limit(200)
    .lean();

  let applied = 0;
  for (const doc of docs) {
    const orderCode = doc.shipping?.ghn?.orderCode;
    if (orderCode) {
      const cancelled = await cancelGHNOrder(orderCode);
      // Keep the case open when GHN has already picked up the parcel, and retry
      // temporary GHN failures on the next cron run.
      if (cancelled !== "cancelled") continue;
    }

    const eventTime = new Date();
    const reason = `Người mua không gửi hàng trong ${DEADLINE_DAYS.shipment} ngày`;
    const res = await transitionReturn({
      id: doc._id,
      from: "awaiting_return_shipment",
      action: "timeout_shipment",
      role: "system",
      reason,
      set: { "shipping.status": "expired_unshipped" },
      push: {
        "shipping.statusLog": {
          status: "expired_unshipped",
          time: eventTime,
        },
      },
    });
    if (!res.ok) continue;

    applied++;
    await notifyReturnEvent({
      returnRequestId: doc._id,
      event: "expired_unshipped",
      note: reason,
    });
  }

  return { scanned: docs.length, applied };
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const now = new Date();

    // Vendor im lặng quá hạn → đẩy lên admin, không để người mua chờ mãi.
    const vendorResponse = await sweep(
      { "deadlines.vendorResponse": { $lt: now } },
      "requested",
      "timeout_vendor_response",
      `Người bán không phản hồi trong ${DEADLINE_DAYS.vendorResponse} ngày`,
      "escalated",
    );

    // Đã duyệt trả nhưng buyer không gửi hàng → đóng case, đơn giữ nguyên delivered.
    const shipment = await sweepExpiredShipments(now);

    // Hàng đã về mà vendor không kiểm định → admin phân xử (tránh giam tiền của buyer).
    const inspection = await sweep(
      { "deadlines.inspection": { $lt: now } },
      "inspection_pending",
      "timeout_inspection",
      `Người bán không kiểm định trong ${DEADLINE_DAYS.inspection} ngày`,
      "escalated",
    );

    // Buyer không khiếu nại trong hạn → chốt theo quyết định từ chối của vendor.
    const appeal = await sweep(
      { "deadlines.appeal": { $lt: now } },
      "vendor_rejected",
      "timeout_appeal",
      `Người mua không khiếu nại trong ${DEADLINE_DAYS.appeal} ngày`,
      "closed_rejected",
    );

    // Vận đơn tự khai (không qua GHN) treo quá lâu: không có hệ thống nào xác nhận hộ
    // được, nên đưa admin xem xét thay vì để "đang chuyển hoàn" vĩnh viễn.
    const manualStuck = await sweep(
      {
        "shipping.mode": "manual",
        // Đo từ lúc buyer khai đã gửi, KHÔNG dùng updatedAt: updatedAt đổi theo mọi ghi
        // (một dòng statusLog cũng reset đồng hồ) nên case treo có thể không bao giờ
        // chạm mốc.
        "shipping.submittedAt": {
          $lt: addDays(now, -DEADLINE_DAYS.manualShipmentEscalate),
        },
      },
      "return_in_transit",
      "carrier_exception",
      `Vận đơn tự khai quá ${DEADLINE_DAYS.manualShipmentEscalate} ngày chưa về`,
      "escalated",
    );

    // Duyệt xong nhưng gọi GHN hỏng → tạo bù, không bắt vendor tự nhớ bấm lại.
    const pendingShipments = await ReturnRequest.find({
      status: "awaiting_return_shipment",
      "shipping.mode": { $ne: "manual" },
      "shipping.ghn.orderCode": { $exists: false },
      "shipping.status": { $in: ["creating", "creation_failed"] },
    })
      .select("_id")
      .limit(50)
      .lean();

    let shipmentsCreated = 0;
    for (const doc of pendingShipments) {
      const res = await ensureReturnShipment(doc._id);
      if (res.ok) shipmentsCreated++;
    }

    return NextResponse.json(
      {
        message: "ok",
        vendorResponse,
        shipment,
        inspection,
        appeal,
        manualStuck,
        shipmentCreation: {
          scanned: pendingShipments.length,
          applied: shipmentsCreated,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[cron process-returns] error:", error);
    return NextResponse.json(
      { message: `Lỗi xử lý hoàn trả định kỳ: ${error}` },
      { status: 500 },
    );
  }
}
