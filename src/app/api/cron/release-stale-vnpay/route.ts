import connectDB from "@/lib/connectDB";
import { releaseStaleVnpayOrders } from "@/lib/voucher/lifecycle";
import { NextRequest, NextResponse } from "next/server";

// B2 — Dọn đơn VNPay bỏ dở quá hạn (hủy + hoàn kho + release voucher).
// Bảo vệ bằng CRON_SECRET; gọi bằng cron ngoài hoặc thủ công khi demo:
//   POST /api/cron/release-stale-vnpay   header: x-cron-secret: <CRON_SECRET>
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const result = await releaseStaleVnpayOrders();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[cron] release-stale-vnpay failed", error);
    return NextResponse.json({ message: "Cron failed" }, { status: 500 });
  }
}
