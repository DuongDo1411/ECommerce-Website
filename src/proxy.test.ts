import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// auth() is the only server dependency of the proxy; each test drives it.
const authState: { value: unknown } = { value: null };
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(authState.value) }));

import { proxy } from "./proxy";

function reqFor(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

/**
 * POST là điều kiện cần để chạm tới lớp CSRF — GET được coi là an toàn nên luôn đi qua.
 * Bỏ trống `origin` để mô phỏng đúng cách provider và scheduler gọi tới: chúng là máy, không
 * phải trình duyệt, nên không bao giờ có header Origin.
 */
function postFor(path: string, origin?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    ...(origin ? { headers: { origin } } : {}),
  });
}

function location(res: Response) {
  const raw = res.headers.get("location");
  return raw ? new URL(raw) : null;
}

afterEach(() => {
  authState.value = null;
  vi.unstubAllEnvs();
});

describe("proxy routes unauthenticated visitors to the matching portal", () => {
  it("sends /admin and its sub-routes to /admin/login", async () => {
    for (const path of ["/admin", "/admin/returns"]) {
      const res = await proxy(reqFor(path));
      expect(res.status).toBe(307);
      expect(location(res)?.pathname).toBe("/admin/login");
    }
  });

  it("sends /vendor sub-routes and /addVendorProduct to /vendor/login", async () => {
    for (const path of ["/vendor", "/vendor/orders", "/addVendorProduct"]) {
      const res = await proxy(reqFor(path));
      expect(location(res)?.pathname).toBe("/vendor/login");
    }
  });

  // Đối trọng của hai test trên: chúng chốt rằng trang riêng tư BỊ chặn, còn test này chốt
  // rằng trang công khai KHÔNG bị chặn. Thiếu nó thì bỏ sót một dòng trong PUBLIC_PAGE_PREFIXES
  // không làm gì đỏ — proxy redirect êm về /login và trang chỉ đơn giản là không dùng được.
  //
  // Đã xảy ra thật với /forgot-password và /reset-password: đặt lại mật khẩu không ai với tới
  // được, vì người cần nó chính là người không đăng nhập được.
  it("lets an unauthenticated visitor reach every public page", async () => {
    for (const path of [
      "/",
      "/login",
      "/register",
      "/vendor/login",
      "/vendor/register",
      "/admin/login",
      "/forgot-password",
      "/reset-password",
      "/activate",
      "/shop",
      "/shop/shop-123",
      "/product/product-123",
      "/category",
      "/vouchers",
    ]) {
      const res = await proxy(reqFor(path));
      expect(res.headers.get("location"), path).toBeNull();
    }
  });

  it("sends other protected pages to /login carrying a safe callbackUrl", async () => {
    const res = await proxy(reqFor("/orders?status=pending"));
    const loc = location(res);
    expect(loc?.pathname).toBe("/login");
    expect(loc?.searchParams.get("callbackUrl")).toBe("/orders?status=pending");
  });
});

describe("proxy keeps role guards for authenticated users", () => {
  it("redirects a non-admin away from /admin to their home", async () => {
    authState.value = { user: { id: "1", role: "user" } };
    const res = await proxy(reqFor("/admin"));
    expect(location(res)?.pathname).toBe("/");
  });

  it("returns 403 for a non-admin API call under /api/admin", async () => {
    authState.value = { user: { id: "1", role: "user" } };
    const res = await proxy(reqFor("/api/admin/dashboard"));
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-vendor API call under /api/vendor", async () => {
    authState.value = { user: { id: "1", role: "user" } };
    const res = await proxy(reqFor("/api/vendor/orders"));
    expect(res.status).toBe(403);
  });

  it("lets a matching role through without a redirect", async () => {
    authState.value = { user: { id: "1", role: "admin" } };
    const res = await proxy(reqFor("/admin"));
    expect(res.headers.get("location")).toBeNull();
  });
});

// Resend và scheduler ngoài không có session và không có Origin. Chúng phải đi qua được cả
// hai lớp chặn của proxy, nhưng CHỈ đúng hai đường dẫn được liệt kê — thứ bảo vệ chúng là
// chữ ký HMAC và x-cron-secret nằm trong route, không phải proxy.
//
// Phải stub NODE_ENV=production mới kiểm chứng được: isCrossSiteRequest() chỉ chặn request
// thiếu Origin khi ở production, nên chạy ở chế độ test sẽ luôn xanh và test thành vô nghĩa.
describe("proxy lets machine-to-machine routes through", () => {
  it("passes an Origin-less POST to the Resend webhook in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await proxy(postFor("/api/webhooks/resend"));
    expect(res.status).toBe(200);
  });

  // Liệt kê cả bốn route cron ở đây là cố ý. Thiếu một đường dẫn trong PUBLIC_API_EXACT
  // không làm test nào khác đỏ, không sinh log, không làm deploy thất bại — scheduler chỉ
  // nhận 401 và công việc định kỳ đó im lặng không bao giờ chạy. Đây là chỗ duy nhất
  // phát hiện được sai sót đó.
  it("passes Origin-less POSTs to every cron route a scheduler must reach", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const path of [
      "/api/cron/flush-email-outbox",
      "/api/cron/release-stale-vnpay",
      "/api/cron/process-returns",
      "/api/cron/release-stale-orders",
    ]) {
      const res = await proxy(postFor(path));
      expect(res.status).toBe(200);
    }
  });

  // Render gọi health check không kèm session. Chặn nó là nền tảng kết luận ứng dụng đã chết
  // rồi restart vô hạn — một dòng thiếu ở PUBLIC_API_EXACT đủ để gây ra vòng lặp đó.
  it("lets the platform health check through without a session", async () => {
    const res = await proxy(reqFor("/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("still blocks an Origin-less POST to any other API in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await proxy(postFor("/api/user/cart"));
    expect(res.status).toBe(403);
  });

  it("does not open sibling paths under /api/webhooks", async () => {
    const res = await proxy(postFor("/api/webhooks/somebody-else"));
    expect(res.status).toBe(401);
  });

  it("does not open a cron route that is not on the list", async () => {
    // Dùng đường dẫn không tồn tại để chốt rằng đây là liệt kê chính xác chứ không phải
    // tiền tố "/api/cron". Route cron thêm về sau phải được khai báo tường minh, không
    // được thừa hưởng quyền public từ những route đứng trước.
    const res = await proxy(postFor("/api/cron/khong-ton-tai"));
    expect(res.status).toBe(401);
  });
});

// /api/assistant/chat khác các route trong PUBLIC_API_EXACT ở trên: người gọi là
// trình duyệt của khách thật (guest), không phải máy — nhưng vẫn phải đi qua đúng
// hai lớp: mở cho khách KHÔNG session, nhưng KHÔNG được miễn kiểm CSRF, và KHÔNG
// được mở nhầm sang các route khác dưới cùng /api/assistant (khai báo EXACT, không
// phải tiền tố).
describe("proxy opens /api/assistant/chat for guests without breaking CSRF", () => {
  it("lets a guest POST /api/assistant/chat same-origin without a session", async () => {
    const res = await proxy(postFor("/api/assistant/chat"));
    expect(res.status).toBe(200);
  });

  it("still returns 403 for a cross-site POST to /api/assistant/chat", async () => {
    const res = await proxy(postFor("/api/assistant/chat", "https://evil.example.com"));
    expect(res.status).toBe(403);
  });

  it("does not open sibling routes under /api/assistant to guests", async () => {
    const res = await proxy(reqFor("/api/assistant/something-else"));
    expect(res.status).toBe(401);
  });
});

describe("proxy keeps CSRF and auth intact for everything else", () => {
  it("returns 403 for a cross-site mutation", async () => {
    const res = await proxy(
      postFor("/api/user/cart", "https://evil.example.com"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 for an unauthenticated API call", async () => {
    const res = await proxy(reqFor("/api/user/cart"));
    expect(res.status).toBe(401);
  });

  it("does not exempt the webhook from its own signature check", async () => {
    // Proxy cho qua, nhưng route vẫn phải tự từ chối. Đây là ranh giới trách nhiệm: proxy
    // chỉ quyết định "có được vào hay không", còn xác thực là việc của route.
    vi.stubEnv("NODE_ENV", "production");
    const res = await proxy(postFor("/api/webhooks/resend"));
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

// Danh sách nhà bán từng nằm trong PUBLIC_API_PREFIXES và trả về email, số điện thoại, mã số
// thuế cùng địa chỉ kho của mọi nhà bán cho bất kỳ ai gọi tới. Test này chốt rằng nó đã đóng,
// vì mở lại chỉ cần thêm đúng một dòng và không có gì báo động.
describe("proxy khong con mo du lieu nha ban cho khach", () => {
  it("chan khach chua dang nhap goi /api/vendor/AllVendor", async () => {
    const res = await proxy(reqFor("/api/vendor/AllVendor"));
    expect(res.status).toBe(401);
  });

  it("chan ca user thuong goi /api/admin/vendors", async () => {
    authState.value = { user: { id: "1", role: "user" } };
    const res = await proxy(reqFor("/api/admin/vendors"));
    expect(res.status).toBe(403);
  });
});
