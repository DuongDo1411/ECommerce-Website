import { describe, expect, it } from "vitest";
import { validateVoucherPayload } from "./validation";

describe("validateVoucherPayload", () => {
  it("rejects percentage discounts above 100", () => {
    expect(
      validateVoucherPayload({
        discountType: "percentage",
        discountValue: 150,
        startAt: "2026-01-01",
        endAt: "2026-01-02",
      }),
    ).toContain("100");
  });

  it("rejects endAt before startAt", () => {
    expect(
      validateVoucherPayload({
        discountType: "fixed",
        discountValue: 10_000,
        startAt: "2026-01-02",
        endAt: "2026-01-01",
      }),
    ).toContain("sau");
  });

  it("rejects product scoped vouchers without products", () => {
    expect(
      validateVoucherPayload({
        discountType: "fixed",
        discountValue: 10_000,
        startAt: "2026-01-01",
        endAt: "2026-01-02",
        scope: "products",
        applicableProducts: [],
      }),
    ).toContain("san pham");
  });

  it("requires maxDiscount > 0 for percentage (C4)", () => {
    expect(
      validateVoucherPayload({
        discountType: "percentage",
        discountValue: 30,
        startAt: "2026-01-01",
        endAt: "2026-12-31",
      }),
    ).toBeTruthy();
    expect(
      validateVoucherPayload({
        discountType: "percentage",
        discountValue: 30,
        maxDiscount: 50_000,
        startAt: "2026-01-01",
        endAt: "2026-12-31",
      }),
    ).toBeNull();
  });

  it("uses current.maxDiscount on partial update", () => {
    expect(
      validateVoucherPayload(
        { discountValue: 40 },
        { discountType: "percentage", maxDiscount: 50_000 },
      ),
    ).toBeNull();
  });

  it("rejects perUserLimit other than 1", () => {
    expect(validateVoucherPayload({ perUserLimit: 3 })).toBeTruthy();
  });
});
