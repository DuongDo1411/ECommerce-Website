// Integration cho bước "xác nhận đóng gói + mô phỏng vận chuyển hoàn".
//
// Bất biến cốt lõi: confirm_ready_for_pickup CHỈ ghi mốc chuẩn bị hàng — không đổi
// status, không reset hạn, và gọi lại bao nhiêu lần cũng chỉ một dòng history. Nhãn in
// và công cụ mô phỏng đều là dữ liệu nhạy cảm nên phải chặn đúng người / đúng môi trường.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// GHN_SHOP_ID/TOKEN phải có trước khi ghn.ts load; CRON_SECRET để test lớp bảo vệ dev.
vi.hoisted(() => {
  process.env.GHN_SHOP_ID = "999";
  process.env.GHN_API_TOKEN = "test-token";
  process.env.CRON_SECRET = "cron-secret";
});

// auth() trả về gì là do từng test quyết định (buyer / người ngoài / admin).
const authState: { value: unknown } = { value: null };
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(authState.value) }));
vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/returns/evidence", () => ({
  collectEvidence: vi
    .fn()
    .mockResolvedValue({ urls: [], publicIds: [] }),
  discardEvidence: vi.fn().mockResolvedValue(undefined),
}));
// Giữ nguyên ghn.ts thật (mapGhnStatusToOrderStatus...), chỉ thay getPrintUrl.
vi.mock("@/lib/ghn", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ghn")>();
  return { ...actual, getPrintUrl: vi.fn() };
});

import { getPrintUrl } from "@/lib/ghn";
import { collectEvidence, discardEvidence } from "@/lib/returns/evidence";
import ReturnRequest from "@/model/returnRequest.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

let replset: MongoMemoryReplSet;
let buyerPATCH: RouteHandler;
let labelGET: RouteHandler;
let simulatePOST: RouteHandler;

const printMock = vi.mocked(getPrintUrl);
const collectEvidenceMock = vi.mocked(collectEvidence);
const discardEvidenceMock = vi.mocked(discardEvidence);

const BUYER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
const VENDOR = new mongoose.Types.ObjectId();

function ctx(id: unknown) {
  return { params: Promise.resolve({ id: String(id) }) };
}

function patchForm(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest("http://localhost/api/returns/x", {
    method: "PATCH",
    body: fd,
  });
}

function simulateReq(body: unknown, secret?: string) {
  return new NextRequest("http://localhost/api/dev/ghn/returns/x/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-cron-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function seedCase(overrides: Record<string, unknown> = {}) {
  return ReturnRequest.create({
    order: new mongoose.Types.ObjectId(),
    buyer: BUYER,
    vendor: VENDOR,
    caseType: "customer_return",
    status: "awaiting_return_shipment",
    reasonCode: "damaged",
    evidence: [],
    requestedAt: new Date(),
    shipping: {
      mode: "ghn",
      ghn: { orderCode: "RET-WAYBILL" },
      status: "ready_to_pick",
    },
    deadlines: { shipment: new Date(Date.now() + 3 * 24 * 3600 * 1000) },
    history: [],
    ...overrides,
  });
}

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  ({ PATCH: buyerPATCH } = await import("@/app/api/returns/[id]/route"));
  ({ GET: labelGET } = await import("@/app/api/returns/[id]/label/route"));
  ({ POST: simulatePOST } = await import(
    "@/app/api/dev/ghn/returns/[id]/simulate/route"
  ));
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

afterEach(async () => {
  await ReturnRequest.deleteMany({});
  authState.value = null;
  vi.clearAllMocks();
});

describe("PATCH confirm_ready_for_pickup", () => {
  it("người KHÔNG sở hữu case → 403, không ghi gì", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(OTHER) } };

    const res = await buyerPATCH(
      patchForm({ action: "confirm_ready_for_pickup" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(403);
    const fresh = await ReturnRequest.findById(doc._id);
    expect(fresh?.shipping?.buyerReadyAt).toBeFalsy();
  });

  it("chủ case: ghi buyerReadyAt, GIỮ NGUYÊN status + hạn, đúng 1 history", async () => {
    const doc = await seedCase();
    const deadlineBefore = doc.deadlines?.shipment?.getTime();
    authState.value = { user: { id: String(BUYER) } };

    const res = await buyerPATCH(
      patchForm({ action: "confirm_ready_for_pickup" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(200);

    const fresh = await ReturnRequest.findById(doc._id);
    expect(fresh?.shipping?.buyerReadyAt).toBeTruthy();
    // KHÔNG đổi trạng thái — hàng chưa được GHN lấy.
    expect(fresh?.status).toBe("awaiting_return_shipment");
    // KHÔNG reset hạn gửi.
    expect(fresh?.deadlines?.shipment?.getTime()).toBe(deadlineBefore);
    const entries = (fresh?.history ?? []).filter(
      (h: { action?: string }) => h.action === "confirm_ready_for_pickup",
    );
    expect(entries).toHaveLength(1);
  });

  it("gọi lại → idempotent: vẫn 200, không thêm history, không đổi mốc", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(BUYER) } };

    const first = await buyerPATCH(
      patchForm({ action: "confirm_ready_for_pickup" }),
      ctx(doc._id),
    );
    expect(first.status).toBe(200);
    const readyAt = (
      await ReturnRequest.findById(doc._id)
    )?.shipping?.buyerReadyAt?.getTime();

    const second = await buyerPATCH(
      patchForm({ action: "confirm_ready_for_pickup" }),
      ctx(doc._id),
    );
    expect(second.status).toBe(200);

    const fresh = await ReturnRequest.findById(doc._id);
    const entries = (fresh?.history ?? []).filter(
      (h: { action?: string }) => h.action === "confirm_ready_for_pickup",
    );
    expect(entries).toHaveLength(1);
    expect(fresh?.shipping?.buyerReadyAt?.getTime()).toBe(readyAt);
  });

  it("vận đơn tự khai (không GHN) → 409", async () => {
    const doc = await seedCase({
      shipping: { mode: "manual", status: "in_transit" },
    });
    authState.value = { user: { id: String(BUYER) } };

    const res = await buyerPATCH(
      patchForm({ action: "confirm_ready_for_pickup" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(409);
  });

  it("sai trạng thái (chưa duyệt) → 409", async () => {
    const doc = await seedCase({ status: "requested" });
    authState.value = { user: { id: String(BUYER) } };

    const res = await buyerPATCH(
      patchForm({ action: "confirm_ready_for_pickup" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(409);
  });

  it("quá hạn gửi hàng → 409", async () => {
    const doc = await seedCase({
      deadlines: { shipment: new Date(Date.now() - 60_000) },
    });
    authState.value = { user: { id: String(BUYER) } };

    const res = await buyerPATCH(
      patchForm({ action: "confirm_ready_for_pickup" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(409);
    expect(
      (await ReturnRequest.findById(doc._id))?.shipping?.buyerReadyAt,
    ).toBeFalsy();
  });
});

describe("PATCH submit_manual_shipment", () => {
  it("quá hạn → 409 trước khi upload ảnh", async () => {
    const doc = await seedCase({
      shipping: { status: "creation_failed" },
      deadlines: { shipment: new Date(Date.now() - 60_000) },
    });
    authState.value = { user: { id: String(BUYER) } };

    const res = await buyerPATCH(
      patchForm({
        action: "submit_manual_shipment",
        carrier: "Viettel Post",
        trackingCode: "MANUAL-001",
      }),
      ctx(doc._id),
    );

    expect(res.status).toBe(409);
    expect(collectEvidenceMock).not.toHaveBeenCalled();
    const fresh = await ReturnRequest.findById(doc._id);
    expect(fresh?.status).toBe("awaiting_return_shipment");
    expect(fresh?.shipping?.submittedAt).toBeFalsy();
  });

  it("lưu ảnh biên nhận khi khai vận đơn thành công", async () => {
    const doc = await seedCase({
      shipping: { status: "creation_failed" },
    });
    authState.value = { user: { id: String(BUYER) } };
    collectEvidenceMock.mockResolvedValueOnce({
      urls: ["https://cdn.example/handover.jpg"],
      publicIds: ["returns/handover"],
    });

    const res = await buyerPATCH(
      patchForm({
        action: "submit_manual_shipment",
        carrier: "Viettel Post",
        trackingCode: "MANUAL-001",
      }),
      ctx(doc._id),
    );

    expect(res.status).toBe(200);
    const fresh = await ReturnRequest.findById(doc._id);
    expect(fresh?.status).toBe("return_in_transit");
    expect(fresh?.shipping?.handoverEvidence).toEqual([
      "https://cdn.example/handover.jpg",
    ]);
  });

  it("transition xung đột sau upload → dọn ảnh vừa tải lên", async () => {
    const doc = await seedCase({
      shipping: { status: "creation_failed" },
    });
    authState.value = { user: { id: String(BUYER) } };
    collectEvidenceMock.mockImplementationOnce(async () => {
      await ReturnRequest.updateOne(
        { _id: doc._id },
        { $set: { status: "cancelled_by_buyer" } },
      );
      return {
        urls: ["https://cdn.example/orphan.jpg"],
        publicIds: ["returns/orphan"],
      };
    });

    const res = await buyerPATCH(
      patchForm({
        action: "submit_manual_shipment",
        carrier: "Viettel Post",
        trackingCode: "MANUAL-002",
      }),
      ctx(doc._id),
    );

    expect(res.status).toBe(409);
    expect(discardEvidenceMock).toHaveBeenCalledWith(
      expect.objectContaining({ publicIds: ["returns/orphan"] }),
    );
  });
});

describe("GET /api/returns/[id]/label", () => {
  it("chủ case + có vận đơn → 200 kèm url", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(BUYER) } };
    printMock.mockResolvedValue("https://ghn.example/print/token");

    const res = await labelGET(new NextRequest("http://localhost"), ctx(doc._id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://ghn.example/print/token");
    expect(printMock).toHaveBeenCalledWith("RET-WAYBILL");
  });

  it("người ngoài case → 403, KHÔNG gọi GHN", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(OTHER) } };

    const res = await labelGET(new NextRequest("http://localhost"), ctx(doc._id));
    expect(res.status).toBe(403);
    expect(printMock).not.toHaveBeenCalled();
  });

  it("chưa có vận đơn GHN → 409", async () => {
    const doc = await seedCase({ shipping: { mode: "ghn", status: "creating" } });
    authState.value = { user: { id: String(BUYER) } };

    const res = await labelGET(new NextRequest("http://localhost"), ctx(doc._id));
    expect(res.status).toBe(409);
  });

  it("GHN lỗi khi cấp token → 502", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(BUYER) } };
    printMock.mockRejectedValue(new Error("GHN down"));

    const res = await labelGET(new NextRequest("http://localhost"), ctx(doc._id));
    expect(res.status).toBe(502);
  });
});

describe("POST /api/dev/ghn/returns/[id]/simulate (khoá hai lớp)", () => {
  it("production → 404 dù là admin", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(VENDOR), role: "admin" } };
    const prev = process.env.NODE_ENV;
    // @ts-expect-error ghi đè NODE_ENV chỉ trong test
    process.env.NODE_ENV = "production";
    try {
      const res = await simulatePOST(
        simulateReq({ status: "picked" }),
        ctx(doc._id),
      );
      expect(res.status).toBe(404);
    } finally {
      // @ts-expect-error khôi phục
      process.env.NODE_ENV = prev;
    }
  });

  it("không phải admin + không có secret → 401", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(BUYER), role: "buyer" } };

    const res = await simulatePOST(
      simulateReq({ status: "picked" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(401);
  });

  it("admin: picked → return_in_transit", async () => {
    const doc = await seedCase({
      shipping: {
        mode: "ghn",
        ghn: { orderCode: "RET-WAYBILL" },
        status: "ready_to_pick",
        buyerReadyAt: new Date(),
      },
    });
    authState.value = { user: { id: String(VENDOR), role: "admin" } };

    const res = await simulatePOST(
      simulateReq({ status: "picked" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(200);
    expect((await ReturnRequest.findById(doc._id))?.status).toBe(
      "return_in_transit",
    );
  });

  it("picked khi buyer chưa sẵn sàng → 409", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(VENDOR), role: "admin" } };

    const res = await simulatePOST(
      simulateReq({ status: "picked" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(409);
    expect((await ReturnRequest.findById(doc._id))?.status).toBe(
      "awaiting_return_shipment",
    );
  });

  it("vận đơn manual không được dùng simulator GHN", async () => {
    const doc = await seedCase({
      status: "return_in_transit",
      shipping: {
        mode: "manual",
        carrier: "Viettel Post",
        trackingCode: "MANUAL-001",
        submittedAt: new Date(),
      },
    });
    authState.value = { user: { id: String(VENDOR), role: "admin" } };

    const res = await simulatePOST(
      simulateReq({ status: "delivered" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(409);
    expect((await ReturnRequest.findById(doc._id))?.status).toBe(
      "return_in_transit",
    );
  });

  it("không được delivered trước khi picked", async () => {
    const doc = await seedCase({
      shipping: {
        mode: "ghn",
        ghn: { orderCode: "RET-WAYBILL" },
        status: "ready_to_pick",
        buyerReadyAt: new Date(),
      },
    });
    authState.value = { user: { id: String(VENDOR), role: "admin" } };

    const res = await simulatePOST(
      simulateReq({ status: "delivered" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(409);
    expect((await ReturnRequest.findById(doc._id))?.status).toBe(
      "awaiting_return_shipment",
    );
  });

  it("status ngoài whitelist → 400", async () => {
    const doc = await seedCase();
    authState.value = { user: { id: String(VENDOR), role: "admin" } };

    const res = await simulatePOST(
      simulateReq({ status: "lost" }),
      ctx(doc._id),
    );
    expect(res.status).toBe(400);
  });

  it("bằng CRON_SECRET: delivered → inspection_pending", async () => {
    const doc = await seedCase({ status: "return_in_transit" });
    // Không set session — chỉ dùng secret.
    const res = await simulatePOST(
      simulateReq({ status: "delivered" }, "cron-secret"),
      ctx(doc._id),
    );
    expect(res.status).toBe(200);
    expect((await ReturnRequest.findById(doc._id))?.status).toBe(
      "inspection_pending",
    );
  });
});
