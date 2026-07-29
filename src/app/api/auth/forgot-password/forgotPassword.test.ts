// Quên mật khẩu: token và mail phải cùng sống hoặc cùng chết.
//
// Hai bất biến ở đây khó thấy bằng mắt nhưng hỏng thì rất đau:
//   - Ghi token xong mà mail hỏng → người dùng chờ một liên kết không bao giờ tới.
//   - Ghi mail xong mà token hỏng → liên kết gửi đi lại vô dụng.
// Transaction loại cả hai. Test dưới đây ép cho outbox hỏng để chứng minh token rollback theo.
//
// Bất biến thứ ba: MỌI đường đi đều trả 202 giống hệt nhau. Chỉ cần một nhánh trả khác đi
// là endpoint này thành công cụ dò xem email nào có tài khoản.

import bcrypt from "bcryptjs";
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

// Route kick flushOne() ngay sau commit để giảm độ trễ, và trong test afterResponse chạy
// luôn tại chỗ (không có ngữ cảnh request của Next). Mock provider để điều khiển xem job
// đã gửi được hay còn nằm chờ — đó chính là tiền đề của phép thử supersession.
const send = vi.fn();
vi.mock("@/lib/mail/provider", () => ({
  getMailProvider: () => ({ name: "console", send }),
}));

import EmailOutbox, { type IEmailOutbox } from "@/model/emailOutbox.model";
import PasswordResetToken from "@/model/passwordResetToken.model";
import RateLimitBucket from "@/model/rateLimitBucket.model";
import User from "@/model/user.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let POST: typeof import("@/app/api/auth/forgot-password/route").POST;

const req = (email: string) =>
  new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

async function seedUser(email: string, withPassword = true) {
  await User.create({
    name: "Người Dùng",
    email,
    role: "user",
    ...(withPassword
      ? { password: await bcrypt.hash("matkhaucu123", 10) }
      : {}),
  });
}

const pendingJobs = () =>
  EmailOutbox.find({ state: "pending" }).lean<IEmailOutbox[]>();

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replset.getUri();
  process.env.MONGODB_URL = uri;
  process.env.AUTH_URL = "https://shop.example.com";
  await mongoose.connect(uri);
  (globalThis as GlobalWithMongoose).mongoose = {
    conn: mongoose.connection,
    promise: Promise.resolve(mongoose.connection),
  };
  POST = (await import("@/app/api/auth/forgot-password/route")).POST;
  await EmailOutbox.init();
}, 120_000);

afterAll(async () => {
  delete process.env.AUTH_URL;
  await mongoose.disconnect();
  await replset.stop();
});

beforeEach(() => {
  send.mockReset();
  // Mặc định: chưa gửi được → job ở lại "pending", đúng trạng thái ta cần quan sát.
  send.mockRejectedValue(new Error("provider tạm thời không gửi được"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    User.deleteMany({}),
    PasswordResetToken.deleteMany({}),
    EmailOutbox.deleteMany({}),
    RateLimitBucket.deleteMany({}),
  ]);
});

describe("POST /api/auth/forgot-password", () => {
  it("tài khoản có mật khẩu: ghi token và mail trong cùng một lượt", async () => {
    await seedUser("a@example.com");

    const res = await POST(req("a@example.com"));

    expect(res.status).toBe(202);
    const token = await PasswordResetToken.findOne({
      emailNormalized: "a@example.com",
    }).lean<{ expiresAt: Date }>();
    const jobs = await pendingJobs();

    expect(token).not.toBeNull();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].rawMessage?.to).toBe("a@example.com");
    // Hết hạn token thì mail vô nghĩa — hai mốc phải trùng khít.
    expect(jobs[0].notAfter?.getTime()).toBe(token!.expiresAt.getTime());
    // Liên kết là bearer token nên payload phải bị xoá khi job chốt.
    expect(jobs[0].scrubOnTerminal).toBe(true);
    expect(jobs[0].supersessionKey).toBe("password-reset:a@example.com");
  });

  it("liên kết trong mail trỏ về AUTH_URL kèm token ở fragment", async () => {
    await seedUser("b@example.com");

    await POST(req("b@example.com"));

    const [job] = await pendingJobs();
    expect(job.rawMessage?.html).toContain(
      "https://shop.example.com/reset-password#token=",
    );
  });

  it("yêu cầu mới huỷ job cũ chưa gửi và xoá payload của nó", async () => {
    await seedUser("c@example.com");

    await POST(req("c@example.com"));
    const first = (await pendingJobs())[0];
    await POST(req("c@example.com"));

    const cancelled = await EmailOutbox.findById(
      first._id,
    ).lean<IEmailOutbox>();
    expect(cancelled?.state).toBe("cancelled");
    expect(cancelled?.rawMessage).toBeUndefined();
    // Chỉ còn đúng một liên kết còn sống.
    expect(await pendingJobs()).toHaveLength(1);
  });

  it("job đã gửi xong thì KHÔNG bị huỷ — chỉ job còn chờ mới huỷ được", async () => {
    await seedUser("g@example.com");
    await POST(req("g@example.com"));
    const [job] = await pendingJobs();

    // Đặt thẳng trạng thái "đã gửi" thay vì gọi flush: route cũng kick flushOne ở nền
    // (fire-and-forget), nên hai lần flush sẽ đua nhau và test thành hên xui. Bất biến cần
    // kiểm ở đây là phạm vi của cancelSupersededMails, không phải việc gửi.
    await EmailOutbox.updateOne(
      { _id: job._id },
      {
        $set: {
          state: "accepted",
          acceptedAt: new Date(),
          providerMessageId: "msg_1",
        },
        $unset: { leaseToken: "", lockedUntil: "" },
      },
    );

    await POST(req("g@example.com"));

    // Mail đã rời khỏi hệ thống rồi; đánh dấu "cancelled" lúc này là nói dối trong log.
    // Token cũ thì vẫn mất hiệu lực — đó mới là thứ bảo vệ tài khoản.
    const after = await EmailOutbox.findById(job._id).lean<IEmailOutbox>();
    expect(after?.state).toBe("accepted");
  });

  it("outbox ghi hỏng thì token cũng rollback — không có token mồ côi", async () => {
    await seedUser("d@example.com");
    vi.spyOn(EmailOutbox, "findOneAndUpdate").mockImplementationOnce(() => {
      throw new Error("ổ đĩa đầy");
    });

    const res = await POST(req("d@example.com"));

    // Vẫn 202: lỗi hạ tầng không được biến thành kênh dò tài khoản.
    expect(res.status).toBe(202);
    expect(await PasswordResetToken.countDocuments({})).toBe(0);
    expect(await EmailOutbox.countDocuments({})).toBe(0);
  });

  it("email không tồn tại: vẫn 202 nhưng không tạo gì", async () => {
    const res = await POST(req("khongtontai@example.com"));

    expect(res.status).toBe(202);
    expect(await EmailOutbox.countDocuments({})).toBe(0);
    expect(await PasswordResetToken.countDocuments({})).toBe(0);
  });

  it("tài khoản chỉ đăng nhập Google: vẫn 202 nhưng không gửi liên kết", async () => {
    await seedUser("e@example.com", false);

    const res = await POST(req("e@example.com"));

    expect(res.status).toBe(202);
    expect(await EmailOutbox.countDocuments({})).toBe(0);
  });

  it("email rỗng: vẫn 202", async () => {
    const res = await POST(req("   "));

    expect(res.status).toBe(202);
    expect(await EmailOutbox.countDocuments({})).toBe(0);
  });

  it("mọi phản hồi 202 dùng chung một thông điệp", async () => {
    await seedUser("f@example.com");

    const existing = await (await POST(req("f@example.com"))).json();
    const missing = await (await POST(req("khong-co@example.com"))).json();

    expect(existing.message).toBe(missing.message);
  });
});
