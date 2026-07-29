// Hạn mức tốc độ gọi provider.
//
// Ba thứ phải đúng cùng lúc: không vượt số request/giây, không vượt số request chạy song
// song, và OTP phải chen được lên trước đám job nền. Thiếu cái thứ ba thì một lượt cron
// quét 200 case sẽ đẩy OTP của người đang đăng nhập xuống cuối hàng.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetMailRateGate, withMailRate } from "./rateGate";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Nhường vòng lặp sự kiện đủ lâu để hàng đợi kịp xếp. */
const tick = () => delay(10);

beforeEach(() => {
  resetMailRateGate({ ratePerSecond: 100, maxConcurrent: 1 });
});

afterEach(() => {
  delete process.env.MAIL_RATE_PER_SECOND;
  resetMailRateGate();
});

describe("giới hạn song song", () => {
  it("không bao giờ chạy quá maxConcurrent task cùng lúc", async () => {
    resetMailRateGate({ ratePerSecond: 100, maxConcurrent: 2 });
    let running = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 10 }, () =>
        withMailRate("normal", async () => {
          running += 1;
          peak = Math.max(peak, running);
          await delay(15);
          running -= 1;
        }),
      ),
    );

    expect(peak).toBe(2);
    expect(running).toBe(0);
  });
});

describe("giới hạn tốc độ", () => {
  it("giãn các request vượt quá số token ban đầu", async () => {
    // Bucket đầy 10 token → 10 request đầu đi ngay, 5 request sau phải chờ ~500ms.
    resetMailRateGate({ ratePerSecond: 10, maxConcurrent: 10 });
    const startedAt = Date.now();

    await Promise.all(
      Array.from({ length: 15 }, () =>
        withMailRate("normal", async () => undefined),
      ),
    );

    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(400);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe("ưu tiên", () => {
  it("OTP (high) vượt lên trước các job nền đang xếp hàng", async () => {
    const order: string[] = [];
    let releaseBlocker!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });

    // Chiếm slot duy nhất để mọi thứ sau đó phải xếp hàng.
    const blocker = withMailRate("normal", async () => {
      order.push("blocker");
      await blocked;
    });
    await tick();

    const first = withMailRate("normal", async () => {
      order.push("normal-1");
    });
    const second = withMailRate("normal", async () => {
      order.push("normal-2");
    });
    // Đến SAU hai job nền nhưng phải được phục vụ TRƯỚC.
    const otp = withMailRate("high", async () => {
      order.push("otp");
    });
    await tick();

    releaseBlocker();
    await Promise.all([blocker, first, second, otp]);

    expect(order).toEqual(["blocker", "otp", "normal-1", "normal-2"]);
  });

  it("cùng mức ưu tiên thì giữ thứ tự vào hàng", async () => {
    const order: string[] = [];
    let releaseBlocker!: () => void;
    const blocked = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });

    const blocker = withMailRate("normal", async () => {
      await blocked;
    });
    await tick();

    const jobs = ["a", "b", "c"].map((id) =>
      withMailRate("normal", async () => {
        order.push(id);
      }),
    );
    await tick();

    releaseBlocker();
    await Promise.all([blocker, ...jobs]);

    expect(order).toEqual(["a", "b", "c"]);
  });
});

describe("trả slot", () => {
  it("task ném lỗi vẫn trả slot, không treo hàng đợi", async () => {
    await expect(
      withMailRate("normal", async () => {
        throw new Error("provider hỏng");
      }),
    ).rejects.toThrow("provider hỏng");

    // Nếu slot bị nuốt thì lệnh dưới đây treo vĩnh viễn.
    await expect(
      withMailRate("normal", async () => "vẫn chạy được"),
    ).resolves.toBe("vẫn chạy được");
  });

  it("ném lại nguyên lỗi gốc, không bọc thêm", async () => {
    const original = new Error("nguyên bản");
    await expect(
      withMailRate("high", async () => {
        throw original;
      }),
    ).rejects.toBe(original);
  });
});

describe("cấu hình từ môi trường", () => {
  it("giá trị vô lý thì quay về mặc định thay vì làm hỏng gate", async () => {
    process.env.MAIL_RATE_PER_SECOND = "0";
    resetMailRateGate();
    await expect(withMailRate("normal", async () => "ok")).resolves.toBe("ok");

    process.env.MAIL_RATE_PER_SECOND = "không-phải-số";
    resetMailRateGate();
    await expect(withMailRate("normal", async () => "ok")).resolves.toBe("ok");
  });

  it("giá trị quá lớn bị kẹp lại nhưng gate vẫn chạy", async () => {
    process.env.MAIL_RATE_PER_SECOND = "999999";
    resetMailRateGate();
    await expect(withMailRate("normal", async () => "ok")).resolves.toBe("ok");
  });
});
