// Webhook GHN là endpoint PUBLIC — bất kỳ ai cũng POST được. Test này canh đúng một
// điều: KHÔNG được tin body. Kẻ tấn công ghép mã vận đơn thật của mình với
// ClientOrderCode của case người khác thì tuyệt đối không được lái trạng thái case đó.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// SHOP_ID phải có trước khi ghn.ts load (đọc env lúc module load).
vi.hoisted(() => {
  process.env.GHN_SHOP_ID = "999";
  process.env.GHN_API_TOKEN = "test-token";
});

// Giữ nguyên các export thật (mapGhnStatusToOrderStatus, GHN_CONFIGURED_SHOP_ID...),
// chỉ thay hai hàm gọi Detail API để điều khiển "GHN nói gì".
vi.mock("@/lib/ghn", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ghn")>();
  return {
    ...actual,
    getGHNOrderDetail: vi.fn(),
    getGHNOrderDetailByClientCode: vi.fn(),
  };
});
vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { getGHNOrderDetail } from "@/lib/ghn";
import ReturnRequest from "@/model/returnRequest.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: (req: NextRequest) => Promise<any>;

const detailMock = vi.mocked(getGHNOrderDetail);

function webhookReq(body: unknown) {
  return new NextRequest("http://localhost/api/ghn/webhook", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function seedReturnCase(orderCode: string) {
  return ReturnRequest.create({
    order: new mongoose.Types.ObjectId(),
    buyer: new mongoose.Types.ObjectId(),
    vendor: new mongoose.Types.ObjectId(),
    caseType: "customer_return",
    status: "return_in_transit",
    reasonCode: "damaged",
    evidence: [],
    requestedAt: new Date(),
    shipping: { mode: "ghn", ghn: { orderCode } },
    history: [],
  });
}

describe("POST /api/ghn/webhook (chống giả mạo)", () => {
  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    process.env.MONGODB_URL = uri;
    await mongoose.connect(uri);
    (globalThis as GlobalWithMongoose).mongoose = {
      conn: mongoose.connection,
      promise: Promise.resolve(mongoose.connection),
    };
    ({ POST } = await import("./route"));
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  afterEach(async () => {
    await ReturnRequest.deleteMany({});
    vi.clearAllMocks();
  });

  it("OrderCode thật của attacker + ClientOrderCode của case NẠN NHÂN → không mutate nạn nhân", async () => {
    const victim = await seedReturnCase("VICTIM_WAYBILL");

    // GHN xác nhận vận đơn của attacker là RET-<attacker>, shop đúng, đã delivered.
    detailMock.mockResolvedValue({
      order_code: "ATTACKER_WAYBILL",
      client_order_code: "RET-attackerownid",
      shop_id: 999,
      status: "delivered",
      leadtime: "",
      finish_date: null,
      cod_amount: 0,
      is_cod_collected: false,
      log: [],
    });

    // Attacker cố lái case nạn nhân bằng cách nhét ClientOrderCode của nạn nhân vào body.
    const req = webhookReq({
      OrderCode: "ATTACKER_WAYBILL",
      ClientOrderCode: `RET-${String(victim._id)}`,
      Status: "delivered",
    });
    const out = await POST(req);
    expect(out.status).toBe(200); // acknowledge, nhưng...

    // ...case nạn nhân KHÔNG bị đẩy sang inspection_pending.
    const fresh = await ReturnRequest.findById(victim._id);
    expect(fresh?.status).toBe("return_in_transit");
  });

  it("shop_id không khớp → bỏ qua, không mutate", async () => {
    const victim = await seedReturnCase("SOME_WAYBILL");
    detailMock.mockResolvedValue({
      order_code: "SOME_WAYBILL",
      client_order_code: "RET-x",
      shop_id: 111, // shop lạ
      status: "delivered",
      leadtime: "",
      finish_date: null,
      cod_amount: 0,
      is_cod_collected: false,
      log: [],
    });

    const out = await POST(
      webhookReq({ OrderCode: "SOME_WAYBILL", Status: "delivered" }),
    );
    expect(out.status).toBe(200);
    const fresh = await ReturnRequest.findById(victim._id);
    expect(fresh?.status).toBe("return_in_transit");
  });

  it("sự kiện HỢP LỆ (identity khớp) → mới được áp dụng", async () => {
    const legit = await seedReturnCase("LEGIT_WAYBILL");
    detailMock.mockResolvedValue({
      order_code: "LEGIT_WAYBILL",
      client_order_code: `RET-${String(legit._id)}`,
      shop_id: 999,
      status: "delivered",
      leadtime: "",
      finish_date: null,
      cod_amount: 0,
      is_cod_collected: false,
      log: [],
    });

    const out = await POST(
      webhookReq({ OrderCode: "LEGIT_WAYBILL", Status: "delivered" }),
    );
    expect(out.status).toBe(200);
    const fresh = await ReturnRequest.findById(legit._id);
    expect(fresh?.status).toBe("inspection_pending");
  });

  it("ignores GHN detail with an incomplete client identity", async () => {
    const victim = await seedReturnCase("INCOMPLETE_WAYBILL");
    detailMock.mockResolvedValue({
      order_code: "INCOMPLETE_WAYBILL",
      client_order_code: "",
      shop_id: 999,
      status: "delivered",
      leadtime: "",
      finish_date: null,
      cod_amount: 0,
      is_cod_collected: false,
      log: [],
    });

    const out = await POST(
      webhookReq({ OrderCode: "INCOMPLETE_WAYBILL", Status: "delivered" }),
    );

    expect(out.status).toBe(200);
    expect((await ReturnRequest.findById(victim._id))?.status).toBe(
      "return_in_transit",
    );
  });

  it("ignores verified identity when the local GHN order code differs", async () => {
    const victim = await seedReturnCase("LOCAL_WAYBILL");
    detailMock.mockResolvedValue({
      order_code: "OTHER_WAYBILL",
      client_order_code: `RET-${String(victim._id)}`,
      shop_id: 999,
      status: "delivered",
      leadtime: "",
      finish_date: null,
      cod_amount: 0,
      is_cod_collected: false,
      log: [],
    });

    const out = await POST(
      webhookReq({ OrderCode: "OTHER_WAYBILL", Status: "delivered" }),
    );

    expect(out.status).toBe(200);
    expect((await ReturnRequest.findById(victim._id))?.status).toBe(
      "return_in_transit",
    );
  });
});
