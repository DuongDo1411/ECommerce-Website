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

import { hashToken } from "@/lib/security/otp";
import PendingRegistration from "@/model/pendingRegistration.model";
import RateLimitBucket from "@/model/rateLimitBucket.model";
import User from "@/model/user.model";

// Outbox bị chặn ở tầng module: test không ghi job thật rồi cố gửi mail. Đồng thời đây là chỗ
// duy nhất lấy được token thô — chỉ nội dung mail mới chứa nó, đúng như thiết kế.
const mocks = vi.hoisted(() => ({
  enqueueMail: vi.fn(),
  flushOne: vi.fn(),
  cancelSupersededMails: vi.fn(),
}));

vi.mock("@/lib/mail/outbox", () => ({
  enqueueMail: mocks.enqueueMail,
  flushOne: mocks.flushOne,
  cancelSupersededMails: mocks.cancelSupersededMails,
}));

type GlobalWithMongoose = typeof globalThis & {
  mongoose?: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  };
};

let replset: MongoMemoryReplSet;
let registerPOST: typeof import("@/app/api/auth/register/route").POST;
let activatePOST: typeof import("@/app/api/auth/activate/route").POST;
let resendPOST: typeof import("@/app/api/auth/register/resend/route").POST;
// Nạp động cùng lý do với các route: module này kéo theo connectDB, vốn đọc MONGODB_URL ngay
// lúc import và ném lỗi khi biến chưa được đặt.
let buildActivationLink: typeof import("@/lib/auth/registrationActivation").buildActivationLink;

const EMAIL = "newcomer@x.com";
const STRONG = "verystrongpassword1";

const req = (body: unknown) =>
  new NextRequest("http://localhost/", {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Token thô chỉ tồn tại trong liên kết đã gửi; lấy nó ra như người dùng bấm vào mail. */
function tokenFromLastMail(): string {
  const call = mocks.enqueueMail.mock.calls.at(-1);
  if (!call) throw new Error("chưa có mail nào được xếp");
  const html = (call[0] as { message: { html: string } }).message.html;
  const match = html.match(/#token=([a-f0-9]{64})/);
  if (!match) throw new Error("mail không chứa token dạng fragment");
  return match[1];
}

async function register(overrides: Record<string, unknown> = {}) {
  return registerPOST(
    req({ name: "Newcomer", email: EMAIL, password: STRONG, ...overrides }),
  );
}

/** Hạn mức nằm trong DB nên phải dọn giữa các test, không thì cooldown 60s làm đỏ hàng loạt. */
async function clearRateLimits() {
  await mongoose.connection.db?.collection("ratelimitbuckets").deleteMany({});
}

const COOLDOWN_WINDOW_MS = 60_000;

/**
 * Cho cooldown 60 giây hết hạn mà KHÔNG đụng tới hạn mức theo giờ.
 *
 * Nhận diện bucket bằng độ dài cửa sổ chứ không bằng khoá: khoá được lưu dưới dạng HMAC nên
 * test không đọc lại được, còn dựng lại phép băm ở đây là chép logic của thư viện vào test và
 * để nó âm thầm lệch khi thư viện đổi.
 */
async function expireCooldownBuckets() {
  const buckets = await RateLimitBucket.find({}).lean();
  const ids = buckets
    .filter(
      (bucket) =>
        bucket.expiresAt.getTime() - bucket.windowStart.getTime() ===
        COOLDOWN_WINDOW_MS,
    )
    .map((bucket) => bucket._id);
  await RateLimitBucket.deleteMany({ _id: { $in: ids } });
}

/**
 * Ép `withTransaction` chạy lại callback: lượt commit đầu ném lỗi mang nhãn
 * TransientTransactionError, đúng thứ MongoDB trả về khi hai transaction giẫm lên nhau.
 *
 * `between` chạy sau khi lượt đầu đã rollback và trước khi lượt sau bắt đầu, để mô phỏng việc
 * thế giới đổi giữa hai lượt. Đây là cách duy nhất dựng lại tình huống mà một biến gán bên
 * trong callback sống sót qua rollback rồi quyết định sai câu trả lời.
 *
 * Trả về số lượt commit đã thử. Test phải kiểm con số này: nếu driver không chạy lại callback
 * thì phép kiểm chính trở thành xanh giả, vì lỗi thoát ra ngoài cũng cho ra cùng một response.
 */
function failFirstCommit(between: () => Promise<void>) {
  const realStartSession = mongoose.startSession.bind(mongoose);
  const state = { commits: 0 };
  vi.spyOn(mongoose, "startSession").mockImplementationOnce(async () => {
    const session = await realStartSession();
    const realCommit = session.commitTransaction.bind(session);
    session.commitTransaction = (async () => {
      state.commits += 1;
      if (state.commits > 1) return realCommit();
      await session.abortTransaction();
      await between();
      const error = new mongoose.mongo.MongoServerError({
        message: "WriteConflict",
      });
      error.addErrorLabel("TransientTransactionError");
      throw error;
    }) as typeof session.commitTransaction;
    return session;
  });
  return state;
}

async function createGoogleUser() {
  await User.create({
    name: "Google User",
    email: EMAIL,
    emailNormalized: EMAIL,
    role: "user",
    emailVerifiedAt: new Date(),
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
  // Unique index phải tồn tại thật, không thì các test đồng thời không chứng minh được gì.
  await PendingRegistration.init();
  await User.init();

  registerPOST = (await import("@/app/api/auth/register/route")).POST;
  activatePOST = (await import("@/app/api/auth/activate/route")).POST;
  resendPOST = (await import("@/app/api/auth/register/resend/route")).POST;
  buildActivationLink = (await import("@/lib/auth/registrationActivation"))
    .buildActivationLink;
});

beforeEach(async () => {
  mocks.enqueueMail.mockReset();
  mocks.flushOne.mockReset();
  mocks.cancelSupersededMails.mockReset();
  mocks.enqueueMail.mockResolvedValue(new mongoose.Types.ObjectId());
  mocks.flushOne.mockResolvedValue({ outcome: "accepted", stopBatch: false });
  mocks.cancelSupersededMails.mockResolvedValue(0);
  // validatePasswordPolicy gọi ra ngoài để đối chiếu danh sách mật khẩu đã rò rỉ.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => "" })),
  );
  await clearRateLimits();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  // Trả lại mọi spy đặt lên mongoose và các model; bỏ bước này thì một test ép commit hỏng sẽ
  // kéo theo cả những test chạy sau nó.
  vi.restoreAllMocks();
  await User.deleteMany({});
  await PendingRegistration.deleteMany({});
  await clearRateLimits();
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset.stop();
});

describe("đăng ký: chưa tạo tài khoản trước khi kích hoạt", () => {
  it("ghi bản ghi chờ và xếp mail, KHÔNG tạo user", async () => {
    const res = await register();
    expect(res.status).toBe(202);

    expect(await User.countDocuments({})).toBe(0);
    expect(await PendingRegistration.countDocuments({})).toBe(1);
    expect(mocks.enqueueMail).toHaveBeenCalledTimes(1);
  });

  it("không bao giờ trả mật khẩu hay hash ra response", async () => {
    const res = await register();
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(STRONG);
    expect(text).not.toContain("$2");
  });

  it("mail chứa token ở URL fragment, không ở query string", async () => {
    await register();
    const html = (
      mocks.enqueueMail.mock.calls[0][0] as { message: { html: string } }
    ).message.html;
    expect(html).toMatch(/#token=[a-f0-9]{64}/);
    expect(html).not.toMatch(/[?&]token=/);
  });

  it("lưu hash mật khẩu chứ không lưu mật khẩu thô, và ẩn hash khỏi truy vấn thường", async () => {
    await register();
    const plain = await PendingRegistration.findOne({});
    expect(plain?.passwordHash).toBeUndefined();

    const withHash = await PendingRegistration.findOne({}).select(
      "+passwordHash",
    );
    expect(withHash!.passwordHash).not.toBe(STRONG);
    expect(await bcrypt.compare(STRONG, withHash!.passwordHash)).toBe(true);
  });

  it("trả 409 khi email đã có tài khoản thật, và không tạo bản ghi chờ", async () => {
    await User.create({
      name: "Existing",
      email: EMAIL,
      emailNormalized: EMAIL,
      password: await bcrypt.hash("someotherpassword1", 10),
      role: "user",
    });

    const res = await register();
    expect(res.status).toBe(409);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
  });

  it("chặn theo cooldown khi đăng ký lại quá nhanh", async () => {
    expect((await register()).status).toBe(202);
    const second = await register();
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });
});

describe("đăng ký lại khi bản ghi chờ còn hiệu lực", () => {
  it("xoay token nhưng giữ nguyên tên và mật khẩu của lượt đầu", async () => {
    await register();
    const firstToken = tokenFromLastMail();
    const before = await PendingRegistration.findOne({}).select(
      "+passwordHash",
    );
    await clearRateLimits();

    // Người khác gõ đúng email này và thử đặt tên, mật khẩu của họ.
    const res = await register({
      name: "Impostor",
      password: "totallydifferentpw9",
    });
    expect(res.status).toBe(202);

    const after = await PendingRegistration.findOne({}).select("+passwordHash");
    expect(after!.name).toBe("Newcomer");
    expect(after!.passwordHash).toBe(before!.passwordHash);
    // Token đã bị xoay nên liên kết cũ không còn dùng được.
    expect(after!.tokenHash).not.toBe(hashToken(firstToken));
    expect((await activatePOST(req({ token: firstToken }))).status).toBe(400);
  });
});

describe("kích hoạt", () => {
  it("tạo tài khoản, đặt emailVerifiedAt và xoá bản ghi chờ", async () => {
    await register();
    const token = tokenFromLastMail();

    const res = await activatePOST(req({ token }));
    expect(res.status).toBe(200);

    const user = await User.findOne({ emailNormalized: EMAIL }).select(
      "+password",
    );
    expect(user).toBeTruthy();
    expect(user!.emailVerifiedAt).toBeTruthy();
    expect(user!.role).toBe("user");
    // Mật khẩu người dùng đặt lúc đăng ký phải dùng được ngay.
    expect(await bcrypt.compare(STRONG, user!.password!)).toBe(true);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });

  it("từ chối token sai định dạng mà không cần truy vấn", async () => {
    expect((await activatePOST(req({ token: "abc" }))).status).toBe(400);
    expect((await activatePOST(req({}))).status).toBe(400);
  });

  it("từ chối token không tồn tại", async () => {
    expect((await activatePOST(req({ token: "a".repeat(64) }))).status).toBe(
      400,
    );
  });

  it("từ chối token đã hết hạn và không tạo tài khoản", async () => {
    await register();
    const token = tokenFromLastMail();
    await PendingRegistration.updateOne(
      {},
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );

    expect((await activatePOST(req({ token }))).status).toBe(400);
    expect(await User.countDocuments({})).toBe(0);
  });

  it("từ chối khi dùng lại token đã kích hoạt", async () => {
    await register();
    const token = tokenFromLastMail();

    expect((await activatePOST(req({ token }))).status).toBe(200);
    expect((await activatePOST(req({ token }))).status).toBe(400);
    expect(await User.countDocuments({ emailNormalized: EMAIL })).toBe(1);
  });

  it("hai lượt kích hoạt đồng thời chỉ tạo đúng một tài khoản", async () => {
    await register();
    const token = tokenFromLastMail();

    const responses = await Promise.all([
      activatePOST(req({ token })),
      activatePOST(req({ token })),
    ]);

    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 400)).toHaveLength(1);
    expect(await User.countDocuments({ emailNormalized: EMAIL })).toBe(1);
  });

  it("không gắn mật khẩu đăng ký vào tài khoản Google đã tồn tại", async () => {
    await register();
    const token = tokenFromLastMail();

    // Mô phỏng Google tạo tài khoản cho chính email này trong lúc chờ: không có mật khẩu.
    await User.create({
      name: "Google User",
      email: EMAIL,
      emailNormalized: EMAIL,
      role: "user",
      emailVerifiedAt: new Date(),
    });

    const res = await activatePOST(req({ token }));
    expect(res.status).toBe(200);

    const user = await User.findOne({ emailNormalized: EMAIL }).select(
      "+password",
    );
    expect(user!.password).toBeFalsy();
    // Bản ghi chờ vẫn phải được dọn để TTL không phải chờ hết 24 giờ.
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });
});

describe("gửi lại liên kết", () => {
  it("xoay token và vô hiệu liên kết cũ", async () => {
    await register();
    const oldToken = tokenFromLastMail();
    await clearRateLimits();

    expect((await resendPOST(req({ email: EMAIL }))).status).toBe(202);
    const newToken = tokenFromLastMail();
    expect(newToken).not.toBe(oldToken);

    expect((await activatePOST(req({ token: oldToken }))).status).toBe(400);
    expect((await activatePOST(req({ token: newToken }))).status).toBe(200);
  });

  it("không đổi tên hay mật khẩu của bản ghi chờ", async () => {
    await register();
    const before = await PendingRegistration.findOne({}).select(
      "+passwordHash",
    );
    await clearRateLimits();

    await resendPOST(req({ email: EMAIL }));

    const after = await PendingRegistration.findOne({}).select("+passwordHash");
    expect(after!.name).toBe(before!.name);
    expect(after!.passwordHash).toBe(before!.passwordHash);
  });

  it("trả cùng một thông điệp cho email chưa từng đăng ký và không xếp mail", async () => {
    const res = await resendPOST(req({ email: "nobody@x.com" }));
    expect(res.status).toBe(202);
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
  });

  it("không hồi sinh bản ghi chờ đã hết hạn", async () => {
    await register();
    await PendingRegistration.updateOne(
      {},
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    mocks.enqueueMail.mockClear();
    await clearRateLimits();

    const res = await resendPOST(req({ email: EMAIL }));
    expect(res.status).toBe(202);
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
  });

  it("áp cooldown dùng chung với route đăng ký", async () => {
    await register();
    // Không dọn hạn mức: gửi lại ngay sau khi đăng ký phải bị chặn, không né được bằng cách
    // đổi sang endpoint khác.
    const res = await resendPOST(req({ email: EMAIL }));
    expect(res.status).toBe(429);
  });

  it("không gửi thêm liên kết khi email đã thành tài khoản Google", async () => {
    await register();
    await clearRateLimits();
    mocks.enqueueMail.mockClear();
    mocks.cancelSupersededMails.mockClear();

    // Người dùng đăng ký bằng mật khẩu rồi quay sang đăng nhập Google trước lúc bấm liên kết.
    await createGoogleUser();

    const res = await resendPOST(req({ email: EMAIL }));
    expect(res.status).toBe(202);
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
    // Bản ghi chờ và những liên kết đã xếp mà chưa gửi đều phải được dọn ngay, không đợi TTL.
    expect(await PendingRegistration.countDocuments({})).toBe(0);
    expect(mocks.cancelSupersededMails).toHaveBeenCalledWith(
      `register-activation:${EMAIL}`,
      expect.anything(),
    );
  });
});

// Ba route đều ghi bản ghi nghiệp vụ và job mail trong cùng một transaction. Hỏng một nửa là
// tình huống tệ nhất: hoặc người dùng ngồi đợi một liên kết không bao giờ tới, hoặc nhận một
// liên kết trỏ tới token chưa từng được lưu.
describe("bản ghi chờ và mail cùng sống cùng chết", () => {
  it("đăng ký: xếp mail hỏng thì không để lại bản ghi chờ", async () => {
    mocks.enqueueMail.mockRejectedValueOnce(new Error("outbox hỏng"));

    const res = await register();
    expect(res.status).toBe(500);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
    expect(await User.countDocuments({})).toBe(0);
  });

  it("gửi lại: xếp mail hỏng thì token cũ vẫn nguyên và vẫn dùng được", async () => {
    await register();
    const oldToken = tokenFromLastMail();
    const before = await PendingRegistration.findOne({});
    await clearRateLimits();

    mocks.enqueueMail.mockRejectedValueOnce(new Error("outbox hỏng"));
    const res = await resendPOST(req({ email: EMAIL }));
    // Vẫn là thông điệp chung: một sự cố hạ tầng không được biến thành kênh dò tài khoản.
    expect(res.status).toBe(202);

    const after = await PendingRegistration.findOne({});
    expect(after!.tokenHash).toBe(before!.tokenHash);
    expect(after!.expiresAt.getTime()).toBe(before!.expiresAt.getTime());
    // Quan trọng nhất: liên kết người dùng đang cầm không bị vô hiệu bởi một lần gửi lại hỏng.
    expect((await activatePOST(req({ token: oldToken }))).status).toBe(200);
  });
});

// MongoDB chạy lại callback của withTransaction khi gặp lỗi nhất thời. Mọi thứ gán vào biến
// bên ngoài callback đều sống sót qua rollback, nên nếu response dựng từ những biến đó thì nó
// mô tả một lượt chưa từng được commit.
describe("chạy lại transaction không mang theo kết quả của lượt đã rollback", () => {
  it("kích hoạt: lượt commit cuối không claim được thì phải trả 400", async () => {
    await register();
    const token = tokenFromLastMail();
    // Có sẵn tài khoản Google cho email này, nên lượt đầu của callback đi vào nhánh "đã có
    // chủ" và kết luận kích hoạt xong.
    await createGoogleUser();

    // Commit đầu hỏng vì lỗi nhất thời; trong lúc rollback, một lượt khác claim mất bản ghi chờ.
    const tx = failFirstCommit(async () => {
      await PendingRegistration.deleteMany({});
    });

    const res = await activatePOST(req({ token }));
    expect(tx.commits).toBe(2);
    expect(res.status).toBe(400);
  });

  it("gửi lại: lượt commit cuối không xếp mail thì không đẩy hàng đợi", async () => {
    await register();
    await clearRateLimits();
    mocks.flushOne.mockClear();

    const tx = failFirstCommit(async () => {
      await PendingRegistration.deleteMany({});
    });

    const res = await resendPOST(req({ email: EMAIL }));
    // Không có dòng này thì test xanh cả khi driver không hề chạy lại callback: lỗi thoát ra
    // ngoài cũng cho ra 202 và cũng không đẩy hàng đợi.
    expect(tx.commits).toBe(2);
    expect(res.status).toBe(202);
    // Lượt được commit không xếp mail nào, nên không có job nào để đẩy. ID của lượt bị
    // rollback trỏ tới một job đã biến mất cùng transaction đó.
    expect(mocks.flushOne).not.toHaveBeenCalled();
  });
});

describe("đua giữa kích hoạt và gửi lại", () => {
  it("token cũ không kích hoạt được và không xoá bản ghi mang token mới", async () => {
    await register();
    const oldToken = tokenFromLastMail();
    await clearRateLimits();

    await resendPOST(req({ email: EMAIL }));
    const newToken = tokenFromLastMail();

    expect((await activatePOST(req({ token: oldToken }))).status).toBe(400);

    // Bản ghi mang token mới phải còn nguyên: người dùng vẫn đang cầm liên kết đó trong hộp
    // thư, và một lần bấm nhầm liên kết cũ không được phép huỷ nó.
    expect(await PendingRegistration.countDocuments({})).toBe(1);
    const pending = await PendingRegistration.findOne({});
    expect(pending!.tokenHash).toBe(hashToken(newToken));
    expect((await activatePOST(req({ token: newToken }))).status).toBe(200);
  });

  it("Google tạo tài khoản đúng khe giữa lần kiểm chủ sở hữu và lệnh ghi", async () => {
    await register();
    const token = tokenFromLastMail();

    const realCreate = User.create.bind(User);
    vi.spyOn(User, "create").mockImplementationOnce(async (...args) => {
      // Chen vào đúng khe đó: tài khoản Google xuất hiện NGOÀI transaction nên lệnh ghi bên
      // trong đâm vào unique index. Tuỳ thời điểm, MongoDB trả về trùng khoá hoặc xung đột
      // ghi; cả hai đường đều phải dẫn tới cùng một kết quả nhìn từ phía người dùng.
      await User.collection.insertOne({
        name: "Google User",
        email: EMAIL,
        emailNormalized: EMAIL,
        role: "user",
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return realCreate(...(args as Parameters<typeof User.create>));
    });

    const res = await activatePOST(req({ token }));
    expect(res.status).toBe(200);

    // Đúng một tài khoản, và mật khẩu của lượt đăng ký KHÔNG được gắn vào tài khoản Google.
    expect(await User.countDocuments({ emailNormalized: EMAIL })).toBe(1);
    const user = await User.findOne({ emailNormalized: EMAIL }).select(
      "+password",
    );
    expect(user!.password).toBeFalsy();
    // Bản ghi chờ phải được dọn dù transaction đã rollback phép xoá của chính nó.
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });
});

describe("hạn mức gửi mail kích hoạt", () => {
  it("bấm dồn dập chỉ tiêu cooldown, không đốt quota năm mail mỗi giờ", async () => {
    expect((await register()).status).toBe(202);

    // Bốn lần bấm vội trong cùng một phút: tất cả bị cooldown chặn.
    for (let index = 0; index < 4; index += 1) {
      expect((await register()).status).toBe(429);
    }

    // Hết một phút. Nếu những lần bị chặn ở trên có tiêu quota giờ thì quota đã cạn từ đây và
    // người dùng bị khoá cả tiếng dù mới nhận đúng một bức mail.
    for (let index = 0; index < 4; index += 1) {
      await expireCooldownBuckets();
      expect((await register()).status, `lượt gửi thứ ${index + 2}`).toBe(202);
    }

    // Lượt thứ sáu vượt hạn mức năm mail mỗi giờ, dù cooldown đã hết.
    await expireCooldownBuckets();
    expect((await register()).status).toBe(429);
  });
});

describe("liên kết và job mail kích hoạt", () => {
  it("token nằm ở fragment và intent=vendor nằm ở query", () => {
    vi.stubEnv("AUTH_URL", "https://multicart.example/");
    const token = "b".repeat(64);

    expect(buildActivationLink(token)).toBe(
      `https://multicart.example/activate#token=${token}`,
    );
    expect(buildActivationLink(token, "vendor")).toBe(
      `https://multicart.example/activate?intent=vendor#token=${token}`,
    );
  });

  it("ném lỗi khi production thiếu AUTH_URL thay vì dựng một liên kết hỏng", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_URL", "");
    // Một liên kết "null/activate#token=..." vẫn gửi đi được và trông bình thường trong hộp
    // thư, nhưng không ai bấm được — hỏng lặng lẽ, chỉ lộ ra khi có người thật kẹt lại.
    expect(() => buildActivationLink("c".repeat(64))).toThrow(/AUTH_URL/);
  });

  it("xếp mail kèm khoá chống trùng, khoá thay thế, hạn dùng và cờ xoá nội dung", async () => {
    await register();
    const pending = await PendingRegistration.findOne({});
    const input = mocks.enqueueMail.mock.calls[0][0] as {
      dedupeKey: string;
      supersessionKey: string;
      notAfter: Date;
      scrubOnTerminal: boolean;
    };

    expect(input.dedupeKey).toBe(`register-activation:${pending!.tokenHash}`);
    expect(input.supersessionKey).toBe(`register-activation:${EMAIL}`);
    // Token hết hạn thì bức mail vô nghĩa; outbox phải biết điều đó để không gửi liên kết chết.
    expect(input.notAfter.getTime()).toBe(pending!.expiresAt.getTime());
    // Liên kết chính là bearer token: đọc được outbox là tạo được tài khoản.
    expect(input.scrubOnTerminal).toBe(true);
  });
});

// Tài khoản nhà bán là tài khoản RIÊNG, bắt buộc dùng email chưa từng đăng ký. Ràng buộc đó do
// chính unique index trên `emailNormalized` thực thi, còn loại tài khoản được tạo thì do `intent`
// của bản ghi chờ quyết định — không do query string trên liên kết.
describe("đăng ký nhà bán", () => {
  const registerVendor = () => register({ intent: "vendor" });

  it("ghi bản ghi chờ mang intent nhà bán và liên kết có intent=vendor", async () => {
    expect((await registerVendor()).status).toBe(202);

    const pending = await PendingRegistration.findOne({});
    expect(pending!.intent).toBe("vendor");
    expect(await User.countDocuments({})).toBe(0);

    const html = (
      mocks.enqueueMail.mock.calls[0][0] as { message: { html: string } }
    ).message.html;
    expect(html).toMatch(/\/activate\?intent=vendor#token=[a-f0-9]{64}/);
  });

  it("kích hoạt tạo tài khoản role vendor ở trạng thái draft, chưa được duyệt", async () => {
    await registerVendor();
    const token = tokenFromLastMail();

    expect((await activatePOST(req({ token }))).status).toBe(200);

    const user = await User.findOne({ emailNormalized: EMAIL }).select(
      "+password",
    );
    expect(user!.role).toBe("vendor");
    // Phải là "draft" chứ không phải "pending": schema mặc định là "pending", và một hồ sơ
    // rỗng ở trạng thái đó sẽ nằm ngay trong hàng chờ duyệt của quản trị viên.
    expect(user!.verificationStatus).toBe("draft");
    expect(user!.isApproved).toBe(false);
    expect(user!.emailVerifiedAt).toBeTruthy();
    expect(await bcrypt.compare(STRONG, user!.password!)).toBe(true);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });

  it("từ chối khi email đã có tài khoản người mua", async () => {
    await User.create({
      name: "Buyer",
      email: EMAIL,
      emailNormalized: EMAIL,
      password: await bcrypt.hash("someotherpassword1", 10),
      role: "user",
    });

    expect((await registerVendor()).status).toBe(409);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
  });

  it("trả 409 khi email đang chờ kích hoạt cho luồng khác", async () => {
    expect((await register()).status).toBe(202);
    const before = await PendingRegistration.findOne({});
    await clearRateLimits();
    mocks.enqueueMail.mockClear();

    const res = await registerVendor();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("registration_intent_conflict");

    // Bản ghi của luồng kia không bị chạm: token cũ vẫn còn dùng được, và không có bức mail
    // nào của luồng nhà bán được xếp cho một địa chỉ đang chờ kích hoạt tài khoản người mua.
    const after = await PendingRegistration.findOne({});
    expect(after!.tokenHash).toBe(before!.tokenHash);
    expect(after!.intent).toBeUndefined();
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
  });

  it("trả 409 khi bản ghi luồng khác xuất hiện giữa lúc đọc và lúc ghi", async () => {
    // Mô phỏng đúng cái khe đó: bản ghi của luồng nhà bán đã tồn tại, nhưng lần đọc trong
    // transaction không thấy nên route đi theo đường tạo mới và đâm vào unique index.
    await PendingRegistration.create({
      name: "Seller",
      email: EMAIL,
      emailNormalized: EMAIL,
      passwordHash: await bcrypt.hash(STRONG, 10),
      tokenHash: "f".repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
      intent: "vendor",
    });

    const blind = { select: () => blind, session: () => Promise.resolve(null) };
    vi.spyOn(PendingRegistration, "findOne").mockImplementationOnce(
      () => blind as unknown as ReturnType<typeof PendingRegistration.findOne>,
    );

    const res = await register();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("registration_intent_conflict");
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
  });

  // Trùng khoá 11000 KHÔNG đồng nghĩa với "hai lượt đăng ký cùng email". `tokenHash` cũng là
  // khoá duy nhất, và outbox có `dedupeKey`. Trả 202 cho những va chạm đó là nói với người dùng
  // rằng liên kết đã được gửi, trong khi không có bản ghi nào và không có bức mail nào.
  it("trả 500 khi trùng khoá đến từ một index khác, không báo đã gửi mail", async () => {
    const duplicate = new mongoose.mongo.MongoServerError({
      message: "E11000 duplicate key error",
    });
    duplicate.code = 11000;
    (duplicate as unknown as { keyPattern: unknown }).keyPattern = {
      tokenHash: 1,
    };
    vi.spyOn(PendingRegistration, "create").mockRejectedValueOnce(duplicate);

    const res = await register();
    expect(res.status).toBe(500);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });

  it("trả 500 khi bản ghi của bên thắng đã hết hạn", async () => {
    // Có bản ghi cùng email nên lệnh ghi đâm vào unique index, nhưng nó đã hết hạn — tức không
    // còn liên kết nào sống để mà nói "đã gửi".
    await PendingRegistration.create({
      name: "Cu",
      email: EMAIL,
      emailNormalized: EMAIL,
      passwordHash: await bcrypt.hash(STRONG, 10),
      tokenHash: "e".repeat(64),
      expiresAt: new Date(Date.now() - 1000),
    });

    const blind = { select: () => blind, session: () => Promise.resolve(null) };
    vi.spyOn(PendingRegistration, "findOne").mockImplementationOnce(
      () => blind as unknown as ReturnType<typeof PendingRegistration.findOne>,
    );

    const res = await register();
    expect(res.status).toBe(500);
    expect(mocks.enqueueMail).not.toHaveBeenCalled();
  });

  it("kích hoạt trả 409 khi email bị tài khoản người mua chiếm trong lúc chờ", async () => {
    await registerVendor();
    const token = tokenFromLastMail();

    // Ai đó đăng nhập Google bằng chính email này trước khi nhà bán bấm liên kết.
    await createGoogleUser();

    const res = await activatePOST(req({ token }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("email_taken");

    // Tài khoản người mua KHÔNG được sửa, và không có tài khoản nhà bán nào được tạo.
    expect(await User.countDocuments({ emailNormalized: EMAIL })).toBe(1);
    const owner = await User.findOne({ emailNormalized: EMAIL });
    expect(owner!.role).toBe("user");
    // Bản ghi chờ đã bị dọn, nên bấm lại liên kết không nhận đúng một lỗi cũ.
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });

  it("kích hoạt trả 200 khi tài khoản nhà bán đã được tạo bởi lượt đua khác", async () => {
    await registerVendor();
    const token = tokenFromLastMail();

    await User.create({
      name: "Seller",
      email: EMAIL,
      emailNormalized: EMAIL,
      role: "vendor",
      verificationStatus: "draft",
      isApproved: false,
    });

    expect((await activatePOST(req({ token }))).status).toBe(200);
    expect(await User.countDocuments({ emailNormalized: EMAIL })).toBe(1);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });
});
