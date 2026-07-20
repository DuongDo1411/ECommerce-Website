import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// auth() is the only server dependency of the proxy; each test drives it.
const authState: { value: unknown } = { value: null };
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(authState.value) }));

import { proxy } from "./proxy";

function reqFor(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

function location(res: Response) {
  const raw = res.headers.get("location");
  return raw ? new URL(raw) : null;
}

afterEach(() => {
  authState.value = null;
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
