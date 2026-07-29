import { auth } from "@/auth";
import { homeForRole } from "@/lib/roleRoutes";
import { isCrossSiteRequest } from "@/lib/security/csrf";
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/register",
  "/vendor/login",
  "/admin/login",
];

const PUBLIC_API_PREFIXES = [
  "/api/auth",
  "/api/shop",
  "/api/user/products",
  "/api/vendor/allProduct",
  "/api/vendor/AllVendor",
];

// Liệt kê từng đường dẫn CHÍNH XÁC, không dùng tiền tố: người gọi ở đây là máy (provider
// hoặc scheduler) nên không có session, nhưng mỗi route tự xác thực bằng chữ ký hoặc secret
// riêng. Mở theo tiền tố "/api/webhooks" hay "/api/cron" là mở luôn cho cả route chưa tồn
// tại, và route thêm sau này sẽ vô tình thành public mà không ai nhận ra.
const PUBLIC_API_EXACT = [
  "/api/admin/check-admin",
  "/api/ghn/webhook",
  "/api/orders/vnpay/ipn",
  "/api/user/currentUser",
  // Resend gọi tới; route tự verify chữ ký Standard Webhooks bằng RESEND_WEBHOOK_SECRET.
  "/api/webhooks/resend",
  // Bốn route cron. Scheduler ngoài không có session; mỗi route tự đối chiếu header
  // x-cron-secret với CRON_SECRET và chặn hết khi biến đó chưa được đặt.
  //
  // Bỏ sót một dòng ở đây là công việc định kỳ tương ứng không bao giờ chạy được ở
  // production, mà không có gì báo động: scheduler chỉ nhận 401 lặng lẽ, còn ứng dụng
  // vẫn xanh. Hai dòng cuối từng thiếu đúng như vậy, khiến toàn bộ cơ chế quét hạn
  // hoàn/trả và giải phóng đơn treo không hoạt động dù mã nguồn đã đầy đủ.
  "/api/cron/flush-email-outbox",
  "/api/cron/release-stale-vnpay",
  "/api/cron/process-returns",
  "/api/cron/release-stale-orders",
];

// Origin-less integrations authenticate with their own signature/secret and
// legitimately arrive without a browser Origin header, so the CSRF guard skips
// them. Everything else that mutates must carry a same-site Origin.
const CSRF_EXEMPT_PREFIXES = [
  "/api/auth/callback",
  "/api/ghn/webhook",
  "/api/orders/vnpay/ipn",
  "/api/cron",
  // Resend POST tới đây không kèm Origin. Bỏ qua CSRF là an toàn vì thứ bảo vệ route này
  // là chữ ký HMAC trên body — mạnh hơn Origin, và Origin thì webhook không thể có.
  "/api/webhooks/resend",
];

const AUTHENTICATED_PAGE_PREFIXES = [
  "/addVendorProduct",
  "/cart",
  "/checkout",
  "/messages",
  "/orders",
  "/profile",
];

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const isPublicApi = (pathname: string) =>
  PUBLIC_API_EXACT.includes(pathname) ||
  PUBLIC_API_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));

const isCsrfExempt = (pathname: string) =>
  CSRF_EXEMPT_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));

const isPublicPage = (pathname: string) =>
  PUBLIC_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));

const unauthorizedApi = () =>
  NextResponse.json({ message: "Unauthorized" }, { status: 401 });

const forbiddenApi = () =>
  NextResponse.json({ message: "Forbidden" }, { status: 403 });

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CSRF: reject cross-site mutations before any routing/auth work, including on
  // public API routes (register/login) so an attacker's page can't drive them.
  if (isApi && !isCsrfExempt(pathname) && isCrossSiteRequest(req)) {
    return NextResponse.json(
      { message: "Yêu cầu bị chặn (cross-site)." },
      { status: 403 },
    );
  }

  if (isApi && isPublicApi(pathname)) {
    return NextResponse.next();
  }

  if (!isApi && (pathname === "/" || isPublicPage(pathname))) {
    return NextResponse.next();
  }

  const session = await auth();
  const role = session?.user?.role;

  if (isApi) {
    if (!session?.user?.id) return unauthorizedApi();

    if (matchesPrefix(pathname, "/api/admin") && role !== "admin") {
      return forbiddenApi();
    }

    if (matchesPrefix(pathname, "/api/vendor") && role !== "vendor") {
      return forbiddenApi();
    }

    return NextResponse.next();
  }

  if (!session?.user?.id) {
    // Route unauthenticated visitors to the login portal that matches the area
    // they were trying to reach, so vendors/admins land on their own portal
    // instead of the user portal.
    if (matchesPrefix(pathname, "/admin")) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    if (
      matchesPrefix(pathname, "/vendor") ||
      matchesPrefix(pathname, "/addVendorProduct")
    ) {
      return NextResponse.redirect(new URL("/vendor/login", req.url));
    }

    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set(
      "callbackUrl",
      req.nextUrl.pathname + req.nextUrl.search,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (matchesPrefix(pathname, "/admin") && role !== "admin") {
    return NextResponse.redirect(new URL(homeForRole(role), req.url));
  }

  if (matchesPrefix(pathname, "/vendor") && role !== "vendor") {
    return NextResponse.redirect(new URL(homeForRole(role), req.url));
  }

  if (
    AUTHENTICATED_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))
  ) {
    if (pathname === "/addVendorProduct" && role !== "vendor") {
      return NextResponse.redirect(new URL(homeForRole(role), req.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|css|js)$).*)",
  ],
};
