// Webhook trạng thái giao mail của Resend.
//
// Chữ ký được KÝ THẬT ở đây (HMAC-SHA256 theo chuẩn Standard Webhooks) chứ không mock hàm
// verify — vì chính việc verify là thứ cần kiểm. Mock nó đi thì test chỉ còn chứng minh
// rằng ta biết gọi một hàm, trong khi endpoint này là cửa công khai duy nhất của hệ thống
// mail: không verify được thì bất kỳ ai cũng bịa được "mail này đã bounce".
//
// Điểm tinh tế thứ hai: sự kiện KHÔNG tới theo thứ tự. "delivered" tới sau "bounced" là
// chuyện thường. Nếu cứ sự kiện mới là ghi đè thì một bức mail hỏng sẽ hiện thành đã giao.

import { createHmac, randomUUID } from "node:crypto";
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
} from "vitest";

import EmailOutbox, { type IEmailOutbox } from "@/model/emailOutbox.model";
import EmailWebhookEvent from "@/model/emailWebhookEvent.model";

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

const SECRET_KEY = Buffer.from("khoa-bi-mat-thu-nghiem-cho-webhook").toString(
  "base64",
);
const SECRET = `whsec_${SECRET_KEY}`;
const MESSAGE_ID = "msg_test_1";

let replset: MongoMemoryReplSet;
let POST: typeof import("./route").POST;
let reconcileWebhookEvents: typeof import("@/lib/mail/webhookEvents").reconcileWebhookEvents;

/** Ký đúng chuẩn Standard Webhooks: v1,base64(HMAC(key, "id.timestamp.payload")). */
function sign(svixId: string, timestamp: string, payload: string) {
  const key = Buffer.from(SECRET_KEY, "base64");
  const digest = createHmac("sha256", key)
    .update(`${svixId}.${timestamp}.${payload}`)
    .digest("base64");
  return `v1,${digest}`;
}

function webhookReq(
  body: Record<string, unknown>,
  options: { svixId?: string; signature?: string; omitHeaders?: boolean } = {},
) {
  const payload = JSON.stringify(body);
  const svixId = options.svixId ?? `msg_${randomUUID()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = options.omitHeaders
    ? {}
    : {
        "svix-id": svixId,
        "svix-timestamp": timestamp,
        "svix-signature": options.signature ?? sign(svixId, timestamp, payload),
      };

  return new NextRequest("http://localhost/api/webhooks/resend", {
    method: "POST",
    body: payload,
    headers,
  });
}

function event(type: string, extra: Record<string, unknown> = {}) {
  return {
    type,
    created_at: new Date().toISOString(),
    data: { email_id: MESSAGE_ID, to: ["buyer@example.com"], ...extra },
  };
}

async function seedAcceptedJob(providerMessageId = MESSAGE_ID) {
  return EmailOutbox.create({
    kind: "raw",
    rawMessage: {
      to: "buyer@example.com",
      subject: "Thử",
      html: "<p>x</p>",
    },
    state: "accepted",
    deliveryStatus: "unknown",
    attempts: 1,
    transientAttempts: 0,
    maxTransientAttempts: 8,
    nextAttemptAt: new Date(),
    scrubOnTerminal: false,
    providerMessageId,
    acceptedAt: new Date(),
  });
}

const readJob = () =>
  EmailOutbox.findOne({
    providerMessageId: MESSAGE_ID,
  }).lean<IEmailOutbox>();

describe("POST /api/webhooks/resend", () => {
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
    ({ reconcileWebhookEvents } = await import("@/lib/mail/webhookEvents"));
    await Promise.all([EmailOutbox.init(), EmailWebhookEvent.init()]);
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
  });

  afterEach(async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    await Promise.all([
      EmailOutbox.deleteMany({}),
      EmailWebhookEvent.deleteMany({}),
    ]);
  });

  describe("xác thực", () => {
    it("thiếu header chữ ký thì 400", async () => {
      const res = await POST(
        webhookReq(event("email.delivered"), { omitHeaders: true }),
      );
      expect(res.status).toBe(400);
    });

    it("chữ ký sai thì 400 và không ghi gì", async () => {
      await seedAcceptedJob();

      const res = await POST(
        // Header HTTP chỉ nhận ASCII, đừng đặt chuỗi tiếng Việt vào đây.
        webhookReq(event("email.bounced"), { signature: "v1,chu-ky-gia-mao" }),
      );

      expect(res.status).toBe(400);
      expect(await EmailWebhookEvent.countDocuments({})).toBe(0);
      expect((await readJob())?.deliveryStatus).toBe("unknown");
    });

    it("chưa cấu hình secret thì 500, không nhận bừa", async () => {
      delete process.env.RESEND_WEBHOOK_SECRET;
      const res = await POST(webhookReq(event("email.delivered")));
      expect(res.status).toBe(500);
    });

    it("chạy được khi KHÔNG có RESEND_API_KEY — xác minh chữ ký không cần khoá gửi", async () => {
      // Đây là kịch bản rollback: đã chuyển về MAIL_PROVIDER=smtp và gỡ RESEND_API_KEY,
      // nhưng webhook của mail gửi trước đó vẫn tiếp tục về. Trói verify vào khoá gửi thì
      // toàn bộ số đó trả 500 và trạng thái giao mất trắng.
      delete process.env.RESEND_API_KEY;
      await seedAcceptedJob();

      const res = await POST(webhookReq(event("email.delivered")));

      expect(res.status).toBe(200);
      expect((await readJob())?.deliveryStatus).toBe("delivered");
    });
  });

  describe("áp dụng trạng thái", () => {
    it("delivered cập nhật job và lưu sự kiện", async () => {
      await seedAcceptedJob();

      const res = await POST(webhookReq(event("email.delivered")));

      expect(res.status).toBe(200);
      expect((await readJob())?.deliveryStatus).toBe("delivered");
      const stored = await EmailWebhookEvent.findOne({}).lean<{
        processedAt?: Date;
        retentionExpiresAt?: Date;
      }>();
      expect(stored?.processedAt).toBeInstanceOf(Date);
      expect(stored?.retentionExpiresAt).toBeInstanceOf(Date);
    });

    it("bounced lưu lại lý do để còn điều tra", async () => {
      await seedAcceptedJob();

      await POST(
        webhookReq(
          event("email.bounced", {
            bounce: {
              message: "Hộp thư không tồn tại",
              subType: "NoEmail",
              type: "Permanent",
            },
          }),
        ),
      );

      const job = await readJob();
      expect(job?.deliveryStatus).toBe("bounced");
      expect(job?.lastError?.message).toBe("Hộp thư không tồn tại");
      expect(job?.lastError?.code).toBe("NoEmail");
    });

    it("cùng svix-id gửi lại thì báo trùng và không xử lý hai lần", async () => {
      await seedAcceptedJob();
      const svixId = "msg_lap_lai";

      const first = await POST(
        webhookReq(event("email.delivered"), { svixId }),
      );
      const second = await POST(
        webhookReq(event("email.delivered"), { svixId }),
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect((await second.json()).duplicate).toBe(true);
      expect(await EmailWebhookEvent.countDocuments({})).toBe(1);
    });
  });

  describe("thứ bậc khi sự kiện tới lệch thứ tự", () => {
    it("delivered KHÔNG ghi đè bounced", async () => {
      await seedAcceptedJob();

      await POST(webhookReq(event("email.bounced")));
      await POST(webhookReq(event("email.delivered")));

      expect((await readJob())?.deliveryStatus).toBe("bounced");
    });

    it("complained ghi đè được delivered — tin xấu quan trọng hơn", async () => {
      await seedAcceptedJob();

      await POST(webhookReq(event("email.delivered")));
      await POST(webhookReq(event("email.complained")));

      expect((await readJob())?.deliveryStatus).toBe("complained");
    });

    it("delayed không ghi đè delivered", async () => {
      await seedAcceptedJob();

      await POST(webhookReq(event("email.delivered")));
      await POST(webhookReq(event("email.delivery_delayed")));

      expect((await readJob())?.deliveryStatus).toBe("delivered");
    });

    it("delivered ghi đè delayed", async () => {
      await seedAcceptedJob();

      await POST(webhookReq(event("email.delivery_delayed")));
      expect((await readJob())?.deliveryStatus).toBe("delayed");

      await POST(webhookReq(event("email.delivered")));
      expect((await readJob())?.deliveryStatus).toBe("delivered");
    });

    it("loại sự kiện không nói gì về số phận mail thì bỏ qua, không kẹt lại", async () => {
      await seedAcceptedJob();

      const res = await POST(webhookReq(event("email.opened")));

      expect((await res.json()).processed).toBe(true);
      expect((await readJob())?.deliveryStatus).toBe("unknown");
    });
  });

  describe("sự kiện về sớm", () => {
    it("chưa có job mang id đó thì giữ lại chờ, không vứt đi", async () => {
      const res = await POST(webhookReq(event("email.bounced")));

      expect(res.status).toBe(200);
      expect((await res.json()).processed).toBe(false);
      const stored = await EmailWebhookEvent.findOne({}).lean<{
        processedAt?: Date;
      }>();
      expect(stored?.processedAt).toBeUndefined();
    });

    it("reconcile áp được sau khi job đã có providerMessageId", async () => {
      await POST(webhookReq(event("email.bounced")));
      // Job được ghi id muộn hơn webhook — đúng cảnh cần reconcile.
      await seedAcceptedJob();

      const summary = await reconcileWebhookEvents();

      expect(summary).toEqual({ scanned: 1, processed: 1 });
      expect((await readJob())?.deliveryStatus).toBe("bounced");
      expect(
        await EmailWebhookEvent.countDocuments({
          processedAt: { $exists: false },
        }),
      ).toBe(0);
    });

    it("reconcile không đụng tới sự kiện đã xử lý", async () => {
      await seedAcceptedJob();
      await POST(webhookReq(event("email.delivered")));

      expect(await reconcileWebhookEvents()).toEqual({
        scanned: 0,
        processed: 0,
      });
    });
  });
});
