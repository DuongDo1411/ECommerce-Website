import connectDB from "@/lib/connectDB";
import {
  recordWebhookEvent,
  type ResendWebhookPayload,
} from "@/lib/mail/webhookEvents";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

// POST /api/webhooks/resend
//
// Endpoint công khai, KHÔNG dùng session: người gọi là Resend chứ không phải người dùng.
// Thứ bảo vệ nó là chữ ký trên body, verify bằng RESEND_WEBHOOK_SECRET. Không có chữ ký
// hợp lệ thì bất kỳ ai cũng có thể bịa ra "mail này đã bounce".
//
// Mã trả về có ý nghĩa với Resend, đừng đổi tuỳ tiện:
//   400 — chữ ký sai/thiếu header. Resend KHÔNG gửi lại. Đúng ý: gửi lại cũng vẫn sai.
//   500 — ta hỏng (DB chết). Resend SẼ gửi lại. Đúng ý: đừng đánh mất sự kiện vì ta trục trặc.
//   200 — đã nhận. Gồm cả sự kiện trùng và sự kiện chưa áp được (còn nằm chờ reconcile).

/** Resend gửi header chuẩn Standard Webhooks; bản cũ dùng tiền tố svix-. Nhận cả hai. */
function signatureHeaders(req: NextRequest) {
  const get = (name: string) =>
    req.headers.get(`svix-${name}`) ?? req.headers.get(`webhook-${name}`);
  return {
    id: get("id"),
    timestamp: get("timestamp"),
    signature: get("signature"),
  };
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed. Chưa cấu hình mà vẫn nhận thì thành cửa cho người lạ bơm trạng thái giả.
    console.error("[webhook resend] thiếu RESEND_WEBHOOK_SECRET");
    return NextResponse.json({ message: "Not configured" }, { status: 500 });
  }

  const { id, timestamp, signature } = signatureHeaders(req);
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ message: "Missing signature" }, { status: 400 });
  }

  // Phải là raw body. Parse JSON trước rồi stringify lại sẽ đổi từng dấu cách và làm chữ
  // ký không bao giờ khớp.
  const payload = await req.text();

  let event: ResendWebhookPayload;
  try {
    // Constructor của Resend NÉM nếu không có API key, nhưng webhooks.verify() không hề
    // dùng tới key — nó chỉ tính HMAC bằng webhookSecret. Truyền chỗ giữ chỗ để việc xác
    // minh chữ ký không bị trói vào cấu hình GỬI mail: khi rollback về MAIL_PROVIDER=smtp
    // thì RESEND_API_KEY có thể đã gỡ, trong khi webhook của mail gửi trước đó vẫn về.
    const verifier = new Resend(
      process.env.RESEND_API_KEY || "re_webhook_verify_only",
    );
    // Qua `unknown`: SDK trả union các kiểu sự kiện cụ thể, còn ta chỉ cần đọc vài trường
    // chung (type, created_at, data.email_id). Hai kiểu không phủ nhau đủ để ép thẳng, và
    // giữ union đầy đủ ở đây chỉ tổ buộc tầng dưới phải biết mọi loại sự kiện Resend có.
    event = verifier.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    }) as unknown as ResendWebhookPayload;
  } catch {
    // Không log payload: nó đến từ nguồn chưa xác thực.
    return NextResponse.json({ message: "Invalid signature" }, { status: 400 });
  }

  try {
    await connectDB();
    const outcome = await recordWebhookEvent(id, event);
    return NextResponse.json(
      {
        message: "ok",
        duplicate: outcome.duplicate,
        // false = chưa nối được với job nào (webhook về trước khi ta kịp lưu id).
        // Sự kiện vẫn được giữ, cron reconcile sẽ áp sau.
        processed: outcome.processed,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[webhook resend] xử lý thất bại:", error);
    // 500 để Resend gửi lại — thà nhận trùng còn hơn mất một tin bounce.
    return NextResponse.json({ message: "Retry later" }, { status: 500 });
  }
}
