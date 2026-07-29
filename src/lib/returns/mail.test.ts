// Dựng nội dung email cho case hoàn trả.
//
// Hai điểm đáng khoá lại:
//
// 1. Nút CTA. Nó từng bị nuốt im lặng suốt vì baseUrl() đọc NEXTAUTH_URL (biến của NextAuth
//    v4) trong khi dự án chạy v5 với AUTH_URL. Mail vẫn gửi, nội dung vẫn đúng, chỉ mất
//    đường dẫn hành động — loại lỗi không ai phát hiện bằng mắt.
//
// 2. Ranh giới null / ném lỗi. Worker outbox đọc hai thứ này rất khác nhau: null = hỏng
//    vĩnh viễn (chuyển dead ngay), ném lỗi = hỏng nhất thời (retry theo backoff). Trả nhầm
//    là hoặc mất mail vĩnh viễn, hoặc retry vô hạn một thứ không bao giờ gửi được.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import ReturnRequest from "@/model/returnRequest.model";
import User from "@/model/user.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let renderReturnMail: typeof import("./mail").renderReturnMail;

async function seedCase(status: string) {
  const [buyer, vendor] = await User.create([
    { name: "Người Mua", email: "buyer@example.com", role: "user" },
    { name: "Người Bán", email: "vendor@example.com", role: "vendor" },
  ]);
  return ReturnRequest.create({
    order: new mongoose.Types.ObjectId(),
    buyer: buyer._id,
    vendor: vendor._id,
    caseType: "customer_return",
    status,
    reasonCode: "damaged",
    evidence: [],
    requestedAt: new Date(),
    history: [],
  });
}

describe("renderReturnMail", () => {
  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    process.env.MONGODB_URL = uri;
    await mongoose.connect(uri);
    (globalThis as GlobalWithMongoose).mongoose = {
      conn: mongoose.connection,
      promise: Promise.resolve(mongoose.connection),
    };
    ({ renderReturnMail } = await import("./mail"));
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  beforeEach(() => {
    process.env.AUTH_URL = "https://shop.example.com";
    delete process.env.ADMIN_EMAIL;
  });

  afterEach(async () => {
    await Promise.all([User.deleteMany({}), ReturnRequest.deleteMany({})]);
    delete process.env.AUTH_URL;
    delete process.env.ADMIN_EMAIL;
  });

  it("dựng CTA từ AUTH_URL (regression: trước đây đọc NEXTAUTH_URL nên nút biến mất)", async () => {
    const doc = await seedCase("requested");

    const mail = await renderReturnMail({
      returnRequestId: doc._id,
      event: "requested",
    });

    expect(mail?.to).toBe("vendor@example.com");
    expect(mail?.html).toContain('href="https://shop.example.com/vendor"');
  });

  it("không có AUTH_URL thì bỏ nút CTA nhưng vẫn có nội dung", async () => {
    delete process.env.AUTH_URL;
    const doc = await seedCase("requested");

    const mail = await renderReturnMail({
      returnRequestId: doc._id,
      event: "requested",
    });

    expect(mail?.html).not.toContain("<a href=");
    expect(mail?.html).toContain("Có yêu cầu trả hàng mới");
  });

  it("escalated gửi cho ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    const doc = await seedCase("escalated");

    const mail = await renderReturnMail({
      returnRequestId: doc._id,
      event: "escalated",
      note: "Vendor không phản hồi",
    });

    expect(mail?.to).toBe("admin@example.com");
    expect(mail?.html).toContain('href="https://shop.example.com/admin"');
    expect(mail?.html).toContain("Vendor không phản hồi");
  });

  it("thiếu ADMIN_EMAIL thì trả null — hỏng vĩnh viễn, đừng retry", async () => {
    const doc = await seedCase("escalated");

    const mail = await renderReturnMail({
      returnRequestId: doc._id,
      event: "escalated",
    });

    expect(mail).toBeNull();
  });

  it("case đã bị xoá thì trả null chứ không ném", async () => {
    const mail = await renderReturnMail({
      returnRequestId: new mongoose.Types.ObjectId(),
      event: "requested",
    });

    expect(mail).toBeNull();
  });

  it("thiếu email người nhận thì trả null", async () => {
    const doc = await seedCase("requested");
    await User.updateOne({ _id: doc.vendor }, { $unset: { email: "" } });

    const mail = await renderReturnMail({
      returnRequestId: doc._id,
      event: "requested",
    });

    expect(mail).toBeNull();
  });

  it("dùng statusAtEvent thay vì trạng thái hiện tại", async () => {
    const doc = await seedCase("requested");
    // Case đã đi tiếp trong lúc job nằm chờ trong outbox.
    await ReturnRequest.updateOne({ _id: doc._id }, { status: "escalated" });

    const mail = await renderReturnMail({
      returnRequestId: doc._id,
      event: "requested",
      statusAtEvent: "requested",
    });

    // Phải báo trạng thái LÚC SINH sự kiện, không phải trạng thái mới nhất.
    expect(mail?.html).toContain("Chờ người bán duyệt");
  });

  it("escape dữ liệu người dùng nhập để không bẻ được layout mail", async () => {
    const doc = await seedCase("requested");
    await User.updateOne(
      { _id: doc.buyer },
      { name: '<img src=x onerror="alert(1)">' },
    );

    const mail = await renderReturnMail({
      returnRequestId: doc._id,
      event: "requested",
    });

    expect(mail?.html).not.toContain("<img src=x");
    expect(mail?.html).toContain("&lt;img src=x");
  });
});
