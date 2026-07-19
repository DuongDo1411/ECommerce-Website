// Backfill chính sách đổi/trả cho Order legacy (đặt trước khi có tính năng hoàn trả).
//   npm run migrate:return-policy
//
// Idempotent: chỉ xử lý Order CHƯA có `returnWindowDaysSnapshot`.
//  - Snapshot Product.replacementDays vào từng item (product đã xóa → 0).
//  - returnWindowDaysSnapshot = min(item windows) (chính sách chặt nhất).
//  - Đơn delivered: returnEligibleUntil = (deliveryDate ?? updatedAt) + snapshot.
//  - KHÔNG tự tạo ReturnRequest cho dữ liệu cũ.
//
// Dùng dynamic import trong main() để nạp env TRƯỚC khi load connectDB
// (ESM hoist mọi `import` tĩnh lên đầu).

import fs from "fs";
import path from "path";

// Nạp .env.local nếu chạy ngoài Next (Node --env-file cũng set sẵn thì bỏ qua).
function loadEnvLocal() {
  if (process.env.MONGODB_URL) return;
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const { default: mongoose } = await import("mongoose");
  const { default: connectDB } = await import("@/lib/connectDB");
  const { default: Order } = await import("@/model/order.model");
  const { default: Product } = await import("@/model/product.model");
  const { computeReturnWindowDays, computeReturnEligibleUntil } = await import(
    "@/lib/returns/policy"
  );

  await connectDB();
  console.log("[backfill-return-policy] connected");

  const cursor = Order.find({
    returnWindowDaysSnapshot: { $exists: false },
  }).cursor();

  let processed = 0;
  let updated = 0;

  for (
    let order = await cursor.next();
    order != null;
    order = await cursor.next()
  ) {
    processed++;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = order.products as any[];
    const productIds = items.map((p) => p.product);
    const products = await Product.find({ _id: { $in: productIds } })
      .select("replacementDays")
      .lean();
    const byId = new Map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      products.map((p: any) => [
        String(p._id),
        Math.max(0, Number(p.replacementDays ?? 0)),
      ]),
    );

    const windows: number[] = [];
    for (const item of items) {
      const days = byId.get(String(item.product)) ?? 0; // product đã xóa → 0
      item.returnWindowDays = days;
      windows.push(days);
    }
    order.markModified("products");

    const snapshot = computeReturnWindowDays(windows);
    order.returnWindowDaysSnapshot = snapshot;
    // Đánh dấu nguồn: cửa sổ này suy từ Product HIỆN TẠI, không phải chốt lúc đặt.
    order.returnPolicySource = "legacy_backfill";

    if (order.orderStatus === "delivered") {
      const base: Date = order.deliveryDate ?? order.updatedAt;
      order.returnEligibleUntil =
        computeReturnEligibleUntil(base, snapshot) ?? undefined;
    }

    await order.save();
    updated++;
    if (updated % 100 === 0) console.log(`[backfill-return-policy] ${updated}...`);
  }

  console.log(
    `[backfill-return-policy] orders done. processed=${processed} updated=${updated}`,
  );

  // ── Suy giai đoạn leo thang cho các case ESCALATED cũ (trước khi có escalation.stage).
  // Chỉ SUY TỪ DỮ LIỆU ĐÃ CÓ, không đoán mò tiền/kho. Idempotent: bỏ qua case đã có stage.
  const { default: ReturnRequest } = await import(
    "@/model/returnRequest.model"
  );
  const escCursor = ReturnRequest.find({
    status: "escalated",
    "escalation.stage": { $exists: false },
  }).cursor();

  let escUpdated = 0;
  for (
    let doc = await escCursor.next();
    doc != null;
    doc = await escCursor.next()
  ) {
    // Giai đoạn suy theo dấu vết vật lý của case, ưu tiên trạng thái muộn nhất:
    //  - đã kiểm định / hàng đã về  → inspection
    //  - có vận đơn hoàn            → return_shipping
    //  - case do giao hỏng sinh ra  → outbound_delivery
    //  - còn lại (vendor từ chối / im lặng) → vendor_review
    let stage: string;
    if (doc.inspection?.result || doc.shipping?.receivedAt) {
      stage = "inspection";
    } else if (doc.shipping?.ghn?.orderCode || doc.shipping?.trackingCode) {
      stage = "return_shipping";
    } else if (doc.caseType === "delivery_failure") {
      stage = "outbound_delivery";
    } else {
      stage = "vendor_review";
    }

    doc.escalation = {
      stage,
      reason:
        doc.caseType === "delivery_failure" ? "delivery_failure" : "buyer_appeal",
      at: doc.updatedAt ?? new Date(),
    };
    await doc.save();
    escUpdated++;
  }

  console.log(
    `[backfill-return-policy] escalation stages inferred=${escUpdated}`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill-return-policy] failed:", err);
  process.exit(1);
});
