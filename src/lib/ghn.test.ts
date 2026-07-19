// cancelGHNOrder phải phân biệt được BA kết cục, vì mỗi cái dẫn tới một quyết định
// trạng thái khác nhau: huỷ thật thì đổi trạng thái, đã lấy hàng thì giữ nguyên (409),
// GHN sập thì đừng đụng gì (503). Gộp thành true/false là mất phân biệt đó.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ghn.ts đọc env lúc MODULE LOAD (const TOKEN = ...). Import bị hoist lên trước mọi câu
// lệnh thường, nên phải set env trong vi.hoisted() — chạy trước cả import — nếu không
// TOKEN rỗng và mọi call ném GHNError(500) ⇒ tất cả ra "temporary_failure".
vi.hoisted(() => {
  process.env.GHN_API_TOKEN = "test-token";
  process.env.GHN_SHOP_ID = "123";
});

import { cancelGHNOrder } from "./ghn";

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
}

describe("cancelGHNOrder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GHN huỷ thành công → 'cancelled'", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { code: 200, message: "OK", data: [{ result: true }] }),
    );
    expect(await cancelGHNOrder("ABC123")).toBe("cancelled");
  });

  it("GHN từ chối (đã lấy hàng) → 'not_cancellable'", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        code: 200,
        message: "OK",
        data: [{ result: false, message: "order picked" }],
      }),
    );
    expect(await cancelGHNOrder("ABC123")).toBe("not_cancellable");
  });

  it("GHN trả 4xx (mã sai) → 'not_cancellable' (thử lại vô ích)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(400, { code: 400, message: "order not found" }),
    );
    expect(await cancelGHNOrder("BADCODE")).toBe("not_cancellable");
  });

  it("GHN trả 5xx → 'temporary_failure' (đáng thử lại)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(500, { code: 500, message: "internal error" }),
    );
    expect(await cancelGHNOrder("ABC123")).toBe("temporary_failure");
  });

  it("mạng lỗi (fetch throw) → 'temporary_failure'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    expect(await cancelGHNOrder("ABC123")).toBe("temporary_failure");
  });
});
