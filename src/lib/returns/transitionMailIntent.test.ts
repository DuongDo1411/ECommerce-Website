// transitionReturn + mailIntent: trạng thái và thông báo phải cùng commit hoặc cùng rollback.
//
// Đây là điểm mấu chốt của cả thiết kế outbox. Bản cũ gửi mail SAU transition và nuốt lỗi,
// nên tồn tại một trạng thái không ai muốn: case đã chuyển nhưng người liên quan không hề
// hay biết, và không có dấu vết nào để lần lại.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import EmailOutbox, { type IEmailOutbox } from "@/model/emailOutbox.model";
import ReturnRequest from "@/model/returnRequest.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let transitionReturn: typeof import("./transition").transitionReturn;

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

const jobs = () => EmailOutbox.find({}).lean<IEmailOutbox[]>();

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
  await EmailOutbox.init();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([ReturnRequest.deleteMany({}), EmailOutbox.deleteMany({})]);
});

describe("transitionReturn với mailIntent", () => {
  it("ghi ý định gửi mail cùng lúc với việc đổi trạng thái", async () => {
    const doc = await seedCase();

    const result = await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "timeout_vendor_response",
      role: "system",
      reason: "Người bán không phản hồi",
      mailIntent: { event: "escalated" },
    });

    expect(result.ok).toBe(true);
    const [job] = await jobs();
    expect(job.kind).toBe("return_event");
    expect(job.state).toBe("pending");
    expect(job.returnIntent?.event).toBe("escalated");
    expect(String(job.returnIntent?.returnRequestId)).toBe(String(doc._id));
    // Ghi lại trạng thái ĐÍCH, không phải trạng thái lúc render.
    expect(job.returnIntent?.statusAtEvent).toBe("escalated");
    // Không có note riêng thì mượn reason của transition.
    expect(job.returnIntent?.note).toBe("Người bán không phản hồi");
  });

  it("không truyền mailIntent thì không sinh job nào", async () => {
    const doc = await seedCase();

    await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "timeout_vendor_response",
      role: "system",
    });

    expect(await jobs()).toHaveLength(0);
  });

  it("transition thua CAS thì không có mail mồ côi", async () => {
    const doc = await seedCase();

    // `from` sai với trạng thái thật → CAS không khớp, transition thất bại.
    const result = await transitionReturn({
      id: doc._id,
      from: "vendor_rejected",
      action: "timeout_appeal",
      role: "system",
      mailIntent: { event: "closed_rejected" },
    });

    expect(result.ok).toBe(false);
    expect(await jobs()).toHaveLength(0);
  });

  it("outbox ghi hỏng thì trạng thái rollback theo — không đổi trong im lặng", async () => {
    const doc = await seedCase();
    vi.spyOn(EmailOutbox, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("ổ đĩa đầy");
    });

    await expect(
      transitionReturn({
        id: doc._id,
        from: "requested",
        action: "timeout_vendor_response",
        role: "system",
        mailIntent: { event: "escalated" },
      }),
    ).rejects.toThrow();

    const after = await ReturnRequest.findById(doc._id).lean<{
      status: string;
      history: unknown[];
    }>();
    expect(after?.status).toBe("requested");
    expect(after?.history).toHaveLength(0);
    expect(await jobs()).toHaveLength(0);
  });

  it("dedupeKey gắn với dòng history nên hai lần escalate là hai mail khác nhau", async () => {
    const doc = await seedCase();

    await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "timeout_vendor_response",
      role: "system",
      mailIntent: { event: "escalated" },
    });

    const [job] = await jobs();
    const historyEntryId = String(job.returnIntent?.historyEntryId);

    // Khoá phải chứa id của dòng history, KHÔNG chỉ id của case — nếu chỉ theo case thì
    // lần escalate thứ hai ở giai đoạn khác sẽ bị coi là trùng và không ai được báo.
    expect(job.dedupeKey).toBe(`return/${doc._id}/${historyEntryId}/escalated`);
    expect(historyEntryId).not.toBe(String(doc._id));
  });

  it("notBefore hoãn mail tới khi dữ liệu phụ thuộc sẵn sàng", async () => {
    const doc = await seedCase();
    const notBefore = new Date(Date.now() + 30_000);

    await transitionReturn({
      id: doc._id,
      from: "requested",
      action: "timeout_vendor_response",
      role: "system",
      mailIntent: { event: "escalated", notBefore },
    });

    const [job] = await jobs();
    expect(job.notBefore?.getTime()).toBe(notBefore.getTime());
  });
});
