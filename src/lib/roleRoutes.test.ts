import { describe, expect, it } from "vitest";
import { homeForRole, safeCallbackPath } from "./roleRoutes";

describe("homeForRole", () => {
  it("maps admin and vendor to their dashboards", () => {
    expect(homeForRole("admin")).toBe("/admin");
    expect(homeForRole("vendor")).toBe("/vendor");
  });

  it("falls back to home for user / unknown / nullish roles", () => {
    expect(homeForRole("user")).toBe("/");
    expect(homeForRole("something-else")).toBe("/");
    expect(homeForRole(undefined)).toBe("/");
    expect(homeForRole(null)).toBe("/");
  });
});

describe("safeCallbackPath", () => {
  it("accepts safe same-origin relative paths", () => {
    expect(safeCallbackPath("/orders?x=1")).toBe("/orders?x=1");
    expect(safeCallbackPath("/vendor")).toBe("/vendor");
  });

  it("rejects empty / nullish input", () => {
    expect(safeCallbackPath(null)).toBeNull();
    expect(safeCallbackPath(undefined)).toBeNull();
    expect(safeCallbackPath("")).toBeNull();
  });

  it("rejects absolute and protocol-relative URLs (open-redirect)", () => {
    expect(safeCallbackPath("//evil.com")).toBeNull();
    expect(safeCallbackPath("https://evil.com")).toBeNull();
    expect(safeCallbackPath("http://evil.com")).toBeNull();
    expect(safeCallbackPath("/\\evil.com")).toBeNull();
    expect(safeCallbackPath("relative/path")).toBeNull();
  });
});
