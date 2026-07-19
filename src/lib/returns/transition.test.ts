// Test tích hợp cho engine chuyển trạng thái ReturnRequest.
//
// Đây là chốt chặn duy nhất của toàn bộ luồng hoàn trả: nếu nó cho hai thao tác cùng
// thắng, một case có thể vừa bị từ chối vừa được hoàn tiền. Nên phần quan trọng nhất ở
// đây là test ĐUA (double-click / retry): chỉ một lần được đi qua.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import ReturnRequest from "@/model/returnRequest.model";

type TransitionModule = typeof import("./transition");

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let transitionReturn: TransitionModule["transitionReturn"];

// Nhận any — xem ghi chú lý do trong lifecycle.test.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function must(value: any): any {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

async function seedCase(status = "requested") {
  return ReturnRequest.create({
    order: new mongoose.Types.ObjectId(),
    buyer: new mongoose.Types.ObjectId(),
    vendor: new mongoose.Types.ObjectId(),
    caseType: "customer_return",
    status,
    reasonCode: "damaged",
    evidence: [],
    requestedAt: new Date(),
    history: [],
  });
}

describe("returns/transition", () => {
  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    process.env.MONGODB_URL = uri;
    await mongoose.connect(uri);
    (globalThis as GlobalWithMongoose).mongoose = {
      conn: mongoose.connection,
      promise: Promise.resolve(mongoose.connection),
    };
    ({ transitionReturn } = await import("./transition"));
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  afterEach(async () => {
    await ReturnRequest.deleteMany({});
  });

  it("chuyển hợp lệ: đổi status và ghi lại history", async () => {
    const doc = await seedCase("requested");
    const actor = new mongoose.Types.ObjectId();

    const res = await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "approve_return",
      role: "vendor",
      actorId: actor,
      reason: "hàng lỗi thật",
    });

    expect(res.ok).toBe(true);
    const fresh = must(await ReturnRequest.findById(doc._id));
    expect(fresh.status).toBe("awaiting_return_shipment");
    // History là dấu vết đối soát — mỗi bước phải để lại đúng một dòng.
    expect(fresh.history).toHaveLength(1);
    expect(fresh.history[0].action).toBe("approve_return");
    expect(fresh.history[0].fromStatus).toBe("requested");
    expect(fresh.history[0].toStatus).toBe("awaiting_return_shipment");
    expect(fresh.history[0].reason).toBe("hàng lỗi thật");
  });

  it("extra set cannot override the state-machine destination", async () => {
    const doc = await seedCase("requested");

    const res = await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "approve_return",
      role: "vendor",
      set: { status: "refunded" },
    });

    expect(res.ok).toBe(true);
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe(
      "awaiting_return_shipment",
    );
  });

  it("sai trạng thái nguồn: từ chối, không đụng vào doc", async () => {
    const doc = await seedCase("refunded");

    const res = await transitionReturn({
      id: doc._id,
      from: "refunded",
      action: "approve_return",
      role: "vendor",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_from");
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe("refunded");
  });

  it("sai vai: buyer không tự duyệt yêu cầu của chính mình", async () => {
    const doc = await seedCase("requested");

    const res = await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "approve_return",
      role: "buyer",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden_role");
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe("requested");
  });

  it("status đã đổi từ lúc đọc (stale) → conflict, không ghi đè", async () => {
    const doc = await seedCase("requested");
    // Ai đó đã duyệt trước.
    await ReturnRequest.updateOne(
      { _id: doc._id },
      { $set: { status: "awaiting_return_shipment" } },
    );

    // Người thứ hai vẫn cầm ảnh chụp cũ ("requested") và cố từ chối.
    const res = await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "reject",
      role: "vendor",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("conflict");
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe(
      "awaiting_return_shipment",
    );
  });

  it("hai thao tác ĐỒNG THỜI: đúng một lần thắng", async () => {
    const doc = await seedCase("requested");

    // Double-click, hoặc hai tab cùng bấm duyệt.
    const [a, b] = await Promise.all([
      transitionReturn({
        id: doc._id,
        from: "requested",
        action: "approve_return",
        role: "vendor",
      }),
      transitionReturn({
        id: doc._id,
        from: "requested",
        action: "approve_return",
        role: "vendor",
      }),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const fresh = must(await ReturnRequest.findById(doc._id));
    expect(fresh.status).toBe("awaiting_return_shipment");
    // Quan trọng: chỉ một dòng history — nếu hai, tức là cả hai đã ghi.
    expect(fresh.history).toHaveLength(1);
  });

  it("duyệt và từ chối cùng lúc: không thể vừa duyệt vừa từ chối", async () => {
    const doc = await seedCase("requested");

    const [approve, reject] = await Promise.all([
      transitionReturn({
        id: doc._id,
        from: "requested",
        action: "approve_return",
        role: "vendor",
      }),
      transitionReturn({
        id: doc._id,
        from: "requested",
        action: "reject",
        role: "vendor",
        reason: "không hợp lệ",
      }),
    ]);

    expect([approve.ok, reject.ok].filter(Boolean)).toHaveLength(1);
    const fresh = must(await ReturnRequest.findById(doc._id));
    expect(["awaiting_return_shipment", "vendor_rejected"]).toContain(
      fresh.status,
    );
    expect(fresh.history).toHaveLength(1);
  });

  // Vendor là MỘT BÊN của tranh chấp. Nếu vendor tự quyết được case đã leo thang thì
  // toàn bộ bước trọng tài thành vô nghĩa — buyer khiếu nại xong lại rơi về tay chính
  // người vừa từ chối mình.
  it.each([
    "approve_return",
    "approve_refund_only",
    "approve_received_return",
    "reject",
  ])("vendor KHÔNG được tự phán quyết case escalated: %s", async (action) => {
    const doc = await seedCase("escalated");

    const res = await transitionReturn({
      id: doc._id,
      from: "escalated",
      action,
      role: "vendor",
      reason: "cố vượt quyền",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("forbidden_role");
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe("escalated");
  });

  it("vendor VẪN duyệt được case requested bình thường", async () => {
    const doc = await seedCase("requested");

    const res = await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "approve_return",
      role: "vendor",
    });

    expect(res.ok).toBe(true);
  });

  // COD giao hỏng: yêu cầu được chấp nhận nhưng chẳng có đồng nào để trả lại.
  // Nếu đẩy vào refund_pending, case sẽ nằm mãi trong hàng đợi hoàn tiền của admin.
  it("resolve_no_refund: đóng case không phát sinh hoàn tiền", async () => {
    const doc = await seedCase("inspection_pending");

    const res = await transitionReturn({
      id: doc._id,
      from: "inspection_pending",
      action: "resolve_no_refund",
      role: "vendor",
      reason: "COD chưa thu tiền",
    });

    expect(res.ok).toBe(true);
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe(
      "resolved_no_refund",
    );
  });

  it("resolve_no_refund từ escalated: chỉ admin", async () => {
    const doc = await seedCase("escalated");

    const vendorTry = await transitionReturn({
      id: doc._id,
      from: "escalated",
      action: "resolve_no_refund",
      role: "vendor",
    });
    expect(vendorTry.ok).toBe(false);

    const adminTry = await transitionReturn({
      id: doc._id,
      from: "escalated",
      action: "resolve_no_refund",
      role: "admin",
      reason: "đơn chưa thanh toán",
    });
    expect(adminTry.ok).toBe(true);
  });

  it("resolved_no_refund là terminal: không nhận thêm transition", async () => {
    const doc = await seedCase("resolved_no_refund");

    const res = await transitionReturn({
      id: doc._id,
      from: "resolved_no_refund",
      action: "approve_refund_only",
      role: "admin",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("invalid_from");
  });

  it("admin từ chối từ escalated là chung thẩm (closed_rejected)", async () => {
    const doc = await seedCase("escalated");

    const res = await transitionReturn({
      id: doc._id,
      from: "escalated",
      action: "reject",
      role: "admin",
      reason: "bằng chứng không đủ",
    });

    expect(res.ok).toBe(true);
    // Cùng action "reject" nhưng đích khác vendor: buyer hết đường khiếu nại tiếp.
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe(
      "closed_rejected",
    );
  });

  it("appeal after inspection returns to the inspection escalation stage", async () => {
    const doc = await seedCase("vendor_rejected");

    const res = await transitionReturn({
      id: doc._id,
      from: "vendor_rejected",
      action: "appeal",
      role: "buyer",
      escalation: { stage: "inspection", reason: "buyer_appeal" },
    });

    expect(res.ok).toBe(true);
    const fresh = must(await ReturnRequest.findById(doc._id));
    expect(fresh.status).toBe("escalated");
    expect(fresh.escalation?.stage).toBe("inspection");
    expect(fresh.escalation?.reason).toBe("buyer_appeal");
  });
});
