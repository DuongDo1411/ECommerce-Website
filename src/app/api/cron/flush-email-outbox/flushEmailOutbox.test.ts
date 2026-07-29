// Cron flush outbox: cổng bảo vệ và hợp đồng phản hồi.
//
// Fail-closed là điểm chính: KHÔNG đặt CRON_SECRET cũng phải trả 401. Nếu để "chưa cấu hình
// thì cho qua" thì endpoint này thành cửa mở cho bất kỳ ai muốn bơm hết hàng đợi mail.

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

const send = vi.fn();
vi.mock("@/lib/mail/provider", () => ({
  getMailProvider: () => ({ name: "console", send }),
}));

import EmailOutbox from "@/model/emailOutbox.model";

type Route = typeof import("./route");
type Outbox = typeof import("@/lib/mail/outbox");

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

const SECRET = "cron-secret-thu-nghiem";
const MESSAGE = {
  to: "buyer@example.com",
  subject: "Thử",
  html: "<p>Nội dung</p>",
};

let replset: MongoMemoryReplSet;
let POST: Route["POST"];
let enqueueMail: Outbox["enqueueMail"];

function req(secret?: string, query = "") {
  return new NextRequest(
    `http://localhost/api/cron/flush-email-outbox${query}`,
    {
      method: "POST",
      headers: secret ? { "x-cron-secret": secret } : {},
    },
  );
}

describe("POST /api/cron/flush-email-outbox", () => {
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
    ({ enqueueMail } = await import("@/lib/mail/outbox"));
    await EmailOutbox.init();
  }, 120_000);

  afterAll(async () => {
    await mongoose.disconnect();
    await replset.stop();
  });

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({ providerMessageId: "msg_1" });
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(async () => {
    await EmailOutbox.deleteMany({});
    delete process.env.CRON_SECRET;
  });

  it("thiếu header thì 401", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("header sai thì 401", async () => {
    const res = await POST(req("sai-bét"));
    expect(res.status).toBe(401);
  });

  it("CRON_SECRET không được cấu hình thì vẫn 401, không mở cửa", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req(SECRET));
    expect(res.status).toBe(401);
  });

  it("header đúng thì 200 và trả tổng kết", async () => {
    const res = await POST(req(SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      message: "ok",
      scanned: 0,
      accepted: 0,
      retried: 0,
      dead: 0,
    });
  });

  it("gửi các job đang chờ", async () => {
    await enqueueMail({ message: MESSAGE });
    await enqueueMail({ message: MESSAGE });

    const body = await (await POST(req(SECRET))).json();

    expect(body.scanned).toBe(2);
    expect(body.accepted).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("tôn trọng ?limit=", async () => {
    await enqueueMail({ message: MESSAGE });
    await enqueueMail({ message: MESSAGE });
    await enqueueMail({ message: MESSAGE });

    const body = await (await POST(req(SECRET, "?limit=1"))).json();

    expect(body.scanned).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("limit vô lý thì quay về mặc định thay vì gửi 0 job", async () => {
    await enqueueMail({ message: MESSAGE });

    const body = await (await POST(req(SECRET, "?limit=-5"))).json();

    expect(body.scanned).toBe(1);
  });
});
