// Bản ghi chờ và job mail được ghi trong cùng một transaction. Mọi test khác của luồng kích
// hoạt đều mock outbox ở tầng module, nên chúng chứng minh được route GỌI đúng, nhưng không
// chứng minh được hai lệnh ghi thật sự cùng commit hoặc cùng biến mất. Tệp này dùng outbox và
// collection `emailoutboxes` thật để lấp đúng khoảng đó.
//
// Chỉ hai thứ bị chặn: `flushOne` để không có lượt gửi nào chạy sau response và làm kết quả
// phụ thuộc thời điểm, và provider để không có request nào bay tới Resend kể cả khi có thứ gì
// đó gọi nhầm.

import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  flushOne: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/lib/mail/outbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mail/outbox")>();
  return { ...actual, flushOne: mocks.flushOne };
});

vi.mock("@/lib/mail/provider", () => ({
  getMailProvider: () => ({ name: "console", send: mocks.send }),
}));

import EmailOutbox from "@/model/emailOutbox.model";
import PendingRegistration from "@/model/pendingRegistration.model";
import User from "@/model/user.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let registerPOST: typeof import("@/app/api/auth/register/route").POST;

const EMAIL = "newcomer@x.com";
const STRONG = "verystrongpassword1";

function register() {
  return registerPOST(
    new NextRequest("http://localhost/", {
      method: "POST",
      body: JSON.stringify({ name: "Newcomer", email: EMAIL, password: STRONG }),
    }),
  );
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
  await PendingRegistration.init();
  await User.init();
  await EmailOutbox.init();

  registerPOST = (await import("@/app/api/auth/register/route")).POST;
});

beforeEach(() => {
  mocks.flushOne.mockReset();
  mocks.send.mockReset();
  mocks.flushOne.mockResolvedValue({ outcome: "accepted", stopBatch: false });
  // validatePasswordPolicy gọi ra ngoài để đối chiếu danh sách mật khẩu đã rò rỉ.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "" })),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await User.deleteMany({});
  await PendingRegistration.deleteMany({});
  await EmailOutbox.deleteMany({});
  await mongoose.connection.db?.collection("ratelimitbuckets").deleteMany({});
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("đăng ký ghi bản ghi chờ và job mail trong cùng transaction", () => {
  it("commit cùng nhau, đủ khoá chống trùng, khoá thay thế, hạn dùng và cờ xoá", async () => {
    expect((await register()).status).toBe(202);

    const pending = await PendingRegistration.findOne({});
    const jobs = await EmailOutbox.find({}).lean();

    expect(pending).toBeTruthy();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].state).toBe("pending");
    expect(jobs[0].dedupeKey).toBe(`register-activation:${pending!.tokenHash}`);
    expect(jobs[0].supersessionKey).toBe(`register-activation:${EMAIL}`);
    expect(jobs[0].notAfter!.getTime()).toBe(pending!.expiresAt.getTime());
    expect(jobs[0].scrubOnTerminal).toBe(true);

    // Nội dung thật đã nằm sẵn trong job, mang token ở fragment chứ không ở query string.
    expect(jobs[0].rawMessage!.to).toBe(EMAIL);
    expect(jobs[0].rawMessage!.html).toMatch(/#token=[a-f0-9]{64}/);
    expect(jobs[0].rawMessage!.html).not.toMatch(/[?&]token=/);

    // Tài khoản chưa tồn tại: nó chỉ được tạo khi chủ hộp thư bấm liên kết.
    expect(await User.countDocuments({})).toBe(0);
  });

  it("ghi job mail hỏng thì bản ghi chờ cũng không còn lại gì", async () => {
    vi.spyOn(EmailOutbox, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("outbox không ghi được");
    });

    expect((await register()).status).toBe(500);

    // Nửa vời là tình huống tệ nhất: bản ghi chờ còn mà mail mất thì người dùng ngồi đợi một
    // liên kết không bao giờ tới, và địa chỉ đó bị giữ chỗ cho tới khi TTL dọn sau 24 giờ.
    expect(await PendingRegistration.countDocuments({})).toBe(0);
    expect(await EmailOutbox.countDocuments({})).toBe(0);
    expect(mocks.flushOne).not.toHaveBeenCalled();
  });

  it("không gọi tới provider trong lúc xử lý request", async () => {
    await register();
    // Gửi mail là việc của lượt quét outbox sau response, không phải của route đăng ký.
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
