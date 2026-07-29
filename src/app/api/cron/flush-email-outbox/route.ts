import connectDB from "@/lib/connectDB";
import { flushEmailOutbox } from "@/lib/mail/outbox";
import { reconcileWebhookEvents } from "@/lib/mail/webhookEvents";
import { NextRequest, NextResponse } from "next/server";

// POST /api/cron/flush-email-outbox   header: x-cron-secret: <CRON_SECRET>
// Chạy định kỳ (khuyến nghị 1 phút/lần).
//
// Đây là NGUỒN ĐẢM BẢO chính cho việc mail được gửi, không phải afterResponse(). Route
// nghiệp vụ có kick flushOne() ngay sau commit chỉ để giảm độ trễ; nếu process chết đúng
// lúc đó thì job vẫn nằm nguyên trong outbox và lượt cron kế tiếp nhặt lên.
//
// Tách riêng khỏi process-returns có chủ đích: nhịp khác nhau (mail tính bằng phút, deadline
// hoàn trả tính bằng ngày), và quan trọng hơn là cô lập lỗi — một lô mail hỏng không được
// phép làm sập lượt quét deadline, và GHN chết cũng không được chặn việc gửi mail.
//
// Hai lượt cron chồng nhau là chuyện bình thường và an toàn: claim dùng CAS + lease nên
// mỗi job chỉ một worker giữ được.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
// Reconcile chỉ là vài update nhỏ, không gọi mạng, nên hạn mức rộng hơn phần gửi.
const WEBHOOK_RECONCILE_LIMIT = 100;

function parseLimit(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(value));
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const summary = await flushEmailOutbox(
      parseLimit(req.nextUrl.searchParams.get("limit")),
    );
    // Nhặt nốt các webhook về TRƯỚC khi outbox kịp lưu providerMessageId. Chạy sau phần
    // flush là có chủ đích: job vừa gửi xong ở trên có thể chính là job mà sự kiện đang
    // chờ, nên cùng một lượt cron là khớp được luôn.
    const webhooks = await reconcileWebhookEvents(WEBHOOK_RECONCILE_LIMIT);
    return NextResponse.json(
      { message: "ok", ...summary, webhooks },
      { status: 200 },
    );
  } catch (error) {
    console.error("[cron flush-email-outbox] error:", error);
    return NextResponse.json(
      { message: "Lỗi xử lý hàng đợi email" },
      { status: 500 },
    );
  }
}
