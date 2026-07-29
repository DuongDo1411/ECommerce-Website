// Worker outbox: claim, lease, backoff, và ranh giới giữa "hỏng mail" với "hỏng cấu hình".
//
// Bất biến sống còn: hai worker không bao giờ cùng gửi một job, và một sự cố cấu hình kéo
// dài KHÔNG được giết sạch hàng đợi. Hai thứ này mà sai thì outbox tệ hơn việc không có
// outbox — vừa mất mail vừa gửi trùng.

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
  vi,
} from "vitest";

const send = vi.fn();
vi.mock("./provider", () => ({
  getMailProvider: () => ({ name: "console", send }),
}));

import EmailOutbox, { type IEmailOutbox } from "@/model/emailOutbox.model";
import { resetMailRateGate } from "./rateGate";
import { MailSendError } from "./types";

type Outbox = typeof import("./outbox");

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let enqueueMail: Outbox["enqueueMail"];
let flushOne: Outbox["flushOne"];
let flushEmailOutbox: Outbox["flushEmailOutbox"];
let cancelSupersededMails: Outbox["cancelSupersededMails"];

const MESSAGE = {
  to: "buyer@example.com",
  subject: "Thử",
  html: "<p>Nội dung</p>",
};

function accepted(id = "msg_1") {
  return { providerMessageId: id };
}

function transientError() {
  return new MailSendError("mạng chập chờn", {
    code: "application_error",
    scope: "transient",
  });
}

function messageError() {
  return new MailSendError("địa chỉ không hợp lệ", {
    code: "validation_error",
    scope: "message",
    status: 422,
  });
}

function quotaError() {
  return new MailSendError("hết quota ngày", {
    code: "daily_quota_exceeded",
    scope: "provider",
    status: 429,
    retryAfterMs: 24 * 60 * 60_000,
  });
}

async function read(id: unknown): Promise<IEmailOutbox> {
  const doc = await EmailOutbox.findById(id).lean<IEmailOutbox>();
  if (!doc) throw new Error("không tìm thấy job");
  return doc;
}

/** Giả lập "đã tới hạn thử lại" mà không phải chờ thật. */
async function makeDue(id: unknown) {
  await EmailOutbox.updateOne(
    { _id: id },
    { $set: { nextAttemptAt: new Date(Date.now() - 1000) } },
  );
}

describe("mail/outbox", () => {
  beforeAll(async () => {
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const uri = replset.getUri();
    process.env.MONGODB_URL = uri;
    await mongoose.connect(uri);
    (globalThis as GlobalWithMongoose).mongoose = {
      conn: mongoose.connection,
      promise: Promise.resolve(mongoose.connection),
    };
    ({ enqueueMail, flushOne, flushEmailOutbox, cancelSupersededMails } =
      await import("./outbox"));
    await EmailOutbox.init();
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  beforeEach(() => {
    send.mockReset();
    resetMailRateGate({ ratePerSecond: 100, maxConcurrent: 10 });
  });

  afterEach(async () => {
    await EmailOutbox.deleteMany({});
  });

  describe("enqueue", () => {
    it("tạo job pending sẵn sàng gửi ngay", async () => {
      const id = await enqueueMail({ message: MESSAGE });
      const doc = await read(id);

      expect(doc.state).toBe("pending");
      expect(doc.attempts).toBe(0);
      expect(doc.transientAttempts).toBe(0);
      expect(doc.deliveryStatus).toBe("unknown");
      expect(doc.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
      // Job chưa chốt số phận thì KHÔNG được có TTL, nếu không Mongo xoá mất trước khi gửi.
      expect(doc.retentionExpiresAt).toBeUndefined();
    });

    it("cùng dedupeKey hai lần chỉ tạo một job", async () => {
      const first = await enqueueMail({ message: MESSAGE, dedupeKey: "k-1" });
      const second = await enqueueMail({ message: MESSAGE, dedupeKey: "k-1" });

      expect(String(first)).toBe(String(second));
      expect(await EmailOutbox.countDocuments({})).toBe(1);
    });

    it("không có dedupeKey thì mỗi lần gọi là một job riêng", async () => {
      await enqueueMail({ message: MESSAGE });
      await enqueueMail({ message: MESSAGE });
      expect(await EmailOutbox.countDocuments({})).toBe(2);
    });
  });

  describe("claim nguyên tử", () => {
    it("năm worker chạy song song thì provider chỉ được gọi ĐÚNG một lần", async () => {
      send.mockResolvedValue(accepted());
      const id = await enqueueMail({ message: MESSAGE });

      const results = await Promise.all(
        Array.from({ length: 5 }, () => flushOne(id)),
      );

      expect(send).toHaveBeenCalledTimes(1);
      expect(results.filter((r) => r.outcome === "accepted")).toHaveLength(1);
      expect(results.filter((r) => r.outcome === "skipped")).toHaveLength(4);
    });

    it("job đang giữ lease thì worker khác không claim được", async () => {
      send.mockResolvedValue(accepted());
      const id = await enqueueMail({ message: MESSAGE });
      await EmailOutbox.updateOne(
        { _id: id },
        {
          $set: {
            leaseToken: "đang-giữ",
            lockedUntil: new Date(Date.now() + 60_000),
          },
        },
      );

      expect((await flushOne(id)).outcome).toBe("skipped");
      expect(send).not.toHaveBeenCalled();
    });

    it("lease hết hạn thì job được nhặt lại", async () => {
      send.mockResolvedValue(accepted());
      const id = await enqueueMail({ message: MESSAGE });
      await EmailOutbox.updateOne(
        { _id: id },
        {
          $set: {
            leaseToken: "lease-cũ",
            lockedUntil: new Date(Date.now() - 1000),
          },
        },
      );

      expect((await flushOne(id)).outcome).toBe("accepted");
    });

    it("worker cũ không ghi đè được lease mới", async () => {
      send.mockResolvedValue(accepted());
      const id = await enqueueMail({ message: MESSAGE });
      await flushOne(id);

      // Đây chính là bộ lọc mà mọi update sau khi gọi provider đều dùng.
      const stale = await EmailOutbox.updateOne(
        { _id: id, state: "pending", leaseToken: "lease-cũ-của-worker-chết" },
        { $set: { state: "dead" } },
      );

      expect(stale.modifiedCount).toBe(0);
      expect((await read(id)).state).toBe("accepted");
    });
  });

  describe("gửi thành công", () => {
    it("ghi accepted kèm providerMessageId, gỡ lease, đặt TTL", async () => {
      send.mockResolvedValue(accepted("msg_abc"));
      const id = await enqueueMail({ message: MESSAGE });

      await flushOne(id);
      const doc = await read(id);

      expect(doc.state).toBe("accepted");
      expect(doc.providerMessageId).toBe("msg_abc");
      expect(doc.provider).toBe("console");
      expect(doc.acceptedAt).toBeInstanceOf(Date);
      expect(doc.leaseToken).toBeUndefined();
      expect(doc.retentionExpiresAt).toBeInstanceOf(Date);
      // accepted ≠ đã giao. Trạng thái giao thật chỉ webhook mới biết.
      expect(doc.deliveryStatus).toBe("unknown");
    });

    it("dùng _id của job làm Idempotency-Key", async () => {
      send.mockResolvedValue(accepted());
      const id = await enqueueMail({ message: MESSAGE });

      await flushOne(id);

      expect(send.mock.calls[0][1].idempotencyKey).toBe(String(id));
    });

    it("scrubOnTerminal xoá payload chứa bí mật ngay khi gửi xong", async () => {
      send.mockResolvedValue(accepted());
      const id = await enqueueMail({
        message: { ...MESSAGE, html: "<a href='/reset#token=BÍ-MẬT'>đổi</a>" },
        scrubOnTerminal: true,
      });

      await flushOne(id);
      const doc = await read(id);

      expect(doc.state).toBe("accepted");
      expect(doc.rawMessage).toBeUndefined();
      expect(doc.materializedMessage).toBeUndefined();
    });
  });

  describe("materialize một lần", () => {
    it("ghim payload ở lần thử đầu và giữ nguyên qua các lần retry", async () => {
      send.mockRejectedValueOnce(transientError());
      const id = await enqueueMail({ message: MESSAGE });

      await flushOne(id);
      const afterFirst = await read(id);
      expect(afterFirst.materializedMessage?.subject).toBe("Thử");

      // Nguồn đổi sau đó cũng không được làm đổi payload đã ghim.
      await EmailOutbox.updateOne(
        { _id: id },
        { $set: { "rawMessage.subject": "Chủ đề mới" } },
      );
      await makeDue(id);
      send.mockResolvedValue(accepted());
      await flushOne(id);

      expect(send.mock.calls[1][0].subject).toBe("Thử");
    });
  });

  describe("lỗi nhất thời", () => {
    it("giữ pending, tăng transientAttempts, lùi lịch ít nhất ~50 giây", async () => {
      send.mockRejectedValue(transientError());
      const id = await enqueueMail({ message: MESSAGE });

      const result = await flushOne(id);
      const doc = await read(id);

      expect(result.outcome).toBe("retry");
      expect(result.stopBatch).toBe(false);
      expect(doc.state).toBe("pending");
      expect(doc.attempts).toBe(1);
      expect(doc.transientAttempts).toBe(1);
      expect(doc.lastError?.code).toBe("application_error");
      expect(doc.leaseToken).toBeUndefined();
      // 1 phút trừ jitter 15%.
      expect(doc.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(50_000);
    });

    it("chưa tới hạn thì lượt quét sau không nhặt lên", async () => {
      send.mockRejectedValue(transientError());
      const id = await enqueueMail({ message: MESSAGE });
      await flushOne(id);

      expect((await flushEmailOutbox()).scanned).toBe(0);
    });

    it("backoff tăng dần theo số lần hỏng", async () => {
      send.mockRejectedValue(transientError());
      const id = await enqueueMail({ message: MESSAGE });
      const gaps: number[] = [];

      for (let i = 0; i < 3; i++) {
        await makeDue(id);
        await flushOne(id);
        const doc = await read(id);
        gaps.push(doc.nextAttemptAt.getTime() - Date.now());
      }

      expect(gaps[1]).toBeGreaterThan(gaps[0]);
      expect(gaps[2]).toBeGreaterThan(gaps[1]);
    });

    it("chạm trần transient thì chuyển dead", async () => {
      send.mockRejectedValue(transientError());
      const id = await enqueueMail({
        message: MESSAGE,
        maxTransientAttempts: 3,
      });

      for (let i = 0; i < 3; i++) {
        await makeDue(id);
        await flushOne(id);
      }

      const doc = await read(id);
      expect(doc.state).toBe("dead");
      expect(doc.retentionExpiresAt).toBeInstanceOf(Date);
      expect((await flushEmailOutbox()).scanned).toBe(0);
    });
  });

  describe("lỗi của chính bức mail", () => {
    it("chuyển dead ngay lần đầu, không đốt thêm lần thử nào", async () => {
      send.mockRejectedValue(messageError());
      const id = await enqueueMail({ message: MESSAGE });

      const result = await flushOne(id);
      const doc = await read(id);

      expect(result.outcome).toBe("dead");
      expect(doc.state).toBe("dead");
      expect(doc.transientAttempts).toBe(0);
      expect(doc.lastError?.status).toBe(422);
    });
  });

  describe("lỗi cấu hình / hạn mức", () => {
    it("giữ pending, hẹn theo lời provider, KHÔNG tính vào transientAttempts", async () => {
      send.mockRejectedValue(quotaError());
      const id = await enqueueMail({ message: MESSAGE });

      const result = await flushOne(id);
      const doc = await read(id);

      expect(result.outcome).toBe("retry");
      expect(result.stopBatch).toBe(true);
      expect(doc.state).toBe("pending");
      expect(doc.transientAttempts).toBe(0);
      expect(doc.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(
        23 * 60 * 60_000,
      );
    });

    it("hỏng quota mười lần liên tiếp vẫn KHÔNG giết job", async () => {
      send.mockRejectedValue(quotaError());
      const id = await enqueueMail({ message: MESSAGE });

      for (let i = 0; i < 10; i++) {
        await makeDue(id);
        await flushOne(id);
      }

      const doc = await read(id);
      expect(doc.state).toBe("pending");
      expect(doc.attempts).toBe(10);
      expect(doc.transientAttempts).toBe(0);
    });

    it("dừng cả lô thay vì đốt từng job một", async () => {
      send.mockRejectedValue(quotaError());
      await enqueueMail({ message: MESSAGE });
      await enqueueMail({ message: MESSAGE });
      await enqueueMail({ message: MESSAGE });

      const summary = await flushEmailOutbox();

      expect(summary.scanned).toBe(3);
      expect(summary.stoppedEarly).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await EmailOutbox.countDocuments({ state: "pending" })).toBe(3);
    });
  });

  describe("cửa sổ thời gian", () => {
    it("quá notAfter thì chuyển expired và KHÔNG gọi provider", async () => {
      const id = await enqueueMail({
        message: MESSAGE,
        notAfter: new Date(Date.now() - 1000),
      });

      const result = await flushOne(id);

      expect(result.outcome).toBe("expired");
      expect(send).not.toHaveBeenCalled();
      expect((await read(id)).state).toBe("expired");
    });

    it("chưa tới notBefore thì chưa nhặt lên", async () => {
      await enqueueMail({
        message: MESSAGE,
        notBefore: new Date(Date.now() + 60_000),
      });

      expect((await flushEmailOutbox()).scanned).toBe(0);
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("huỷ job bị thay thế", () => {
    it("yêu cầu mới làm job cũ cùng supersessionKey thành cancelled và bị xoá payload", async () => {
      const id = await enqueueMail({
        message: MESSAGE,
        supersessionKey: "password-reset:buyer@example.com",
        scrubOnTerminal: true,
      });

      const cancelled = await cancelSupersededMails(
        "password-reset:buyer@example.com",
      );
      const doc = await read(id);

      expect(cancelled).toBe(1);
      expect(doc.state).toBe("cancelled");
      expect(doc.rawMessage).toBeUndefined();
      expect(doc.retentionExpiresAt).toBeInstanceOf(Date);
    });

    it("job đã cancelled thì không còn được gửi", async () => {
      send.mockResolvedValue(accepted());
      const id = await enqueueMail({ message: MESSAGE, supersessionKey: "k" });
      await cancelSupersededMails("k");

      expect((await flushOne(id)).outcome).toBe("skipped");
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("flushEmailOutbox", () => {
    it("tôn trọng limit", async () => {
      send.mockResolvedValue(accepted());
      await enqueueMail({ message: MESSAGE });
      await enqueueMail({ message: MESSAGE });
      await enqueueMail({ message: MESSAGE });

      const summary = await flushEmailOutbox(2);

      expect(summary.scanned).toBe(2);
      expect(summary.accepted).toBe(2);
    });

    it("tổng kết đúng số job theo từng kết cục", async () => {
      const ok = await enqueueMail({ message: MESSAGE });
      const bad = await enqueueMail({ message: MESSAGE });
      await EmailOutbox.updateOne(
        { _id: bad },
        { $set: { "rawMessage.to": "xau@example.com" } },
      );
      send.mockImplementation((msg: { to: string }) =>
        msg.to === "xau@example.com"
          ? Promise.reject(messageError())
          : Promise.resolve(accepted()),
      );

      const summary = await flushEmailOutbox();

      expect(summary.scanned).toBe(2);
      expect(summary.accepted).toBe(1);
      expect(summary.dead).toBe(1);
      expect((await read(ok)).state).toBe("accepted");
      expect((await read(bad)).state).toBe("dead");
    });
  });
});
