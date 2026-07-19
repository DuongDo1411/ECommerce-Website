// Test tích hợp cho tầng áp dụng sự kiện GHN (dùng chung bởi webhook + track route).
//
// Đây là nơi "sự kiện vật lý" của GHN biến thành thay đổi nghiệp vụ, nên các bất biến
// nguy hiểm nằm ở đây: giao thành công phải chốt deliveryDate + cửa sổ đổi/trả (thiếu
// thì buyer không bao giờ trả hàng được); giao hỏng KHÔNG được tự "returned"/hoàn kho;
// hàng hoàn về tới nơi mới chỉ "chờ kiểm định", chưa hoàn kho.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Email best-effort — chặn không cho gọi SMTP thật trong test.
vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import Order from "@/model/order.model";
import Product from "@/model/product.model";
import ReturnRequest from "@/model/returnRequest.model";
import User from "@/model/user.model";

type GhnEvents = typeof import("./ghnEvents");

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

const VENDOR_ID = new mongoose.Types.ObjectId();
const BUYER_ID = new mongoose.Types.ObjectId();

let replset: MongoMemoryReplSet;
let applyReturnShipmentEvent: GhnEvents["applyReturnShipmentEvent"];
let applyOutboundOrderEvent: GhnEvents["applyOutboundOrderEvent"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function must(v: any) {
  if (v === null || v === undefined) throw new Error("expected a value");
  return v;
}

async function seedOrder(overrides: Record<string, unknown> = {}) {
  return Order.create({
    buyer: BUYER_ID,
    productVendor: VENDOR_ID,
    products: [
      { product: new mongoose.Types.ObjectId(), quantity: 1, price: 100_000 },
    ],
    productsTotal: 100_000,
    deliveryCharge: 30_000,
    serviceCharge: 15_000,
    totalAmount: 145_000,
    paymentMethod: "cod",
    orderStatus: "shipped",
    returnWindowDaysSnapshot: 7,
    address: {
      name: "Buyer",
      phone: "0900000000",
      address: "123 Street",
      city: "Ha Noi",
      pincode: "",
    },
    ghn: { orderCode: "OUT123" },
    ...overrides,
  });
}

async function seedReturnCase(
  status: string,
  shipping?: Record<string, unknown>,
) {
  return ReturnRequest.create({
    order: new mongoose.Types.ObjectId(),
    buyer: BUYER_ID,
    vendor: VENDOR_ID,
    caseType: "customer_return",
    status,
    reasonCode: "damaged",
    evidence: [],
    requestedAt: new Date(),
    ...(shipping ? { shipping } : {}),
    history: [],
  });
}

describe("returns/ghnEvents", () => {
  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    process.env.MONGODB_URL = uri;
    await mongoose.connect(uri);
    (globalThis as GlobalWithMongoose).mongoose = {
      conn: mongoose.connection,
      promise: Promise.resolve(mongoose.connection),
    };
    ({ applyReturnShipmentEvent, applyOutboundOrderEvent } = await import(
      "./ghnEvents"
    ));
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  afterEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Product.deleteMany({}),
      Order.deleteMany({}),
      ReturnRequest.deleteMany({}),
    ]);
  });

  /* ─────────────  Vận đơn XUÔI  ───────────── */

  it("giao thành công: chốt deliveryDate + returnEligibleUntil + COD isPaid", async () => {
    const order = await seedOrder();
    await applyOutboundOrderEvent({ order, status: "delivered" });

    const fresh = must(await Order.findById(order._id));
    expect(fresh.orderStatus).toBe("delivered");
    expect(fresh.deliveryDate).toBeTruthy();
    // Thiếu mốc này thì checkReturnEligibility trả no_delivery_date → không trả được.
    expect(fresh.returnEligibleUntil).toBeTruthy();
    expect(fresh.isPaid).toBe(true); // COD giao xong = đã thu tiền
  });

  it("giao hỏng (returned): KHÔNG chuyển 'returned', mở case chờ kiểm định", async () => {
    const order = await seedOrder();
    await applyOutboundOrderEvent({ order, status: "returned" });

    const fresh = must(await Order.findById(order._id));
    // Hàng quay về ≠ đã hoàn xong — chỉ đánh dấu ngoại lệ, chưa hoàn kho.
    expect(fresh.orderStatus).toBe("delivery_exception");
    const kase = must(await ReturnRequest.findOne({ order: order._id }));
    expect(kase.caseType).toBe("delivery_failure");
    expect(kase.status).toBe("inspection_pending");
    expect(kase.finalFaultParty).toBe("carrier");
    expect(kase.shipping?.receivedAt).toBeTruthy();
  });

  it("giao hỏng (lost): mở case escalated stage=outbound_delivery, không kiểm định", async () => {
    const order = await seedOrder();
    await applyOutboundOrderEvent({ order, status: "lost" });

    const kase = must(await ReturnRequest.findOne({ order: order._id }));
    // Không có hàng lành về → admin phân xử, không có gì để kiểm định.
    expect(kase.status).toBe("escalated");
    expect(kase.escalation?.stage).toBe("outbound_delivery");
  });

  it("sự kiện trùng: gọi 2 lần không tạo 2 case (unique index trên order)", async () => {
    const order = await seedOrder();
    await applyOutboundOrderEvent({ order, status: "returned" });
    await applyOutboundOrderEvent({ order, status: "returned" });
    expect(await ReturnRequest.countDocuments({ order: order._id })).toBe(1);
  });

  /* ─────────────  Vận đơn NGƯỢC  ───────────── */

  it("hàng hoàn tới nơi (delivered): chỉ chuyển inspection_pending, KHÔNG hoàn kho", async () => {
    const doc = await seedReturnCase("return_in_transit", {
      mode: "ghn",
      ghn: { orderCode: "RET1" },
    });
    const res = await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "delivered",
    });
    expect(res.applied).toBe(true);
    const fresh = must(await ReturnRequest.findById(doc._id));
    expect(fresh.status).toBe("inspection_pending");
    expect(fresh.shipping?.receivedAt).toBeTruthy();
  });

  it("late GHN delivery after escalation returns the case to inspection", async () => {
    const doc = await seedReturnCase("escalated", {
      mode: "ghn",
      ghn: { orderCode: "RET-LATE" },
    });
    await ReturnRequest.updateOne(
      { _id: doc._id },
      {
        $set: {
          escalation: {
            stage: "return_shipping",
            reason: "carrier_exception",
            at: new Date(),
          },
        },
      },
    );

    const result = await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "delivered",
    });

    expect(result.applied).toBe(true);
    const fresh = must(await ReturnRequest.findById(doc._id));
    expect(fresh.status).toBe("inspection_pending");
    expect(fresh.escalation?.stage).toBeUndefined();
    expect(fresh.shipping?.receivedAt).toBeTruthy();
  });

  it("sự cố hoàn (return_fail): chuyển escalated, không hoàn kho", async () => {
    const doc = await seedReturnCase("return_in_transit", {
      mode: "ghn",
      ghn: { orderCode: "RET2" },
    });
    await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "return_fail",
    });
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe("escalated");
  });

  it("đã lấy hàng (picked) từ awaiting: chuyển return_in_transit", async () => {
    const doc = await seedReturnCase("awaiting_return_shipment", {
      mode: "ghn",
      ghn: { orderCode: "RET3" },
    });
    await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "picked",
    });
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe(
      "return_in_transit",
    );
  });

  it("sự kiện lặp trạng thái: idempotent (không nhân đôi history/log)", async () => {
    const doc = await seedReturnCase("return_in_transit", {
      mode: "ghn",
      ghn: { orderCode: "RET4" },
    });
    await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "delivered",
    });
    // Sự kiện tới trễ lần hai — case đã ở inspection_pending, transition không áp lại.
    const res2 = await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "delivered",
    });
    expect(res2.applied).toBe(false);
    expect(must(await ReturnRequest.findById(doc._id)).status).toBe(
      "inspection_pending",
    );
  });

  it("an out-of-order pickup event cannot regress a delivered return", async () => {
    const doc = await seedReturnCase("return_in_transit", {
      mode: "ghn",
      status: "transporting",
      ghn: { orderCode: "RET-ORDERED" },
    });
    await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "delivered",
    });

    const stale = await applyReturnShipmentEvent({
      returnRequestId: doc._id,
      status: "picked",
    });

    expect(stale.applied).toBe(false);
    const fresh = must(await ReturnRequest.findById(doc._id));
    expect(fresh.status).toBe("inspection_pending");
    expect(fresh.shipping?.status).toBe("delivered");
  });
});
