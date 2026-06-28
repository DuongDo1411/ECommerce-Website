import { auth } from "@/auth";
import { homeForRole } from "@/lib/roleRoutes";
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

const PUBLIC_API_EXACT = [
  "/api/admin/check-admin",
  "/api/ghn/webhook",
  "/api/orders/vnpay/ipn",
  "/api/user/currentUser",
  "/api/cron/release-stale-vnpay",
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

const isPublicPage = (pathname: string) =>
  PUBLIC_PAGE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));

const unauthorizedApi = () =>
  NextResponse.json({ message: "Unauthorized" }, { status: 401 });

const forbiddenApi = () =>
  NextResponse.json({ message: "Forbidden" }, { status: 403 });

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

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
