import { describe, expect, it } from "vitest";
import { computeDiscount } from "./discount";

describe("computeDiscount", () => {
  it("clamps fixed discounts to the eligible base", () => {
    expect(
      computeDiscount({ discountType: "fixed", discountValue: 50_000 }, 30_000),
    ).toBe(30_000);
  });

  it("applies percentage discount with maxDiscount", () => {
    expect(
      computeDiscount(
        { discountType: "percentage", discountValue: 20, maxDiscount: 15_000 },
        100_000,
      ),
    ).toBe(15_000);
  });

  it("applies freeship discount to shipping fee", () => {
    expect(
      computeDiscount(
        { discountType: "freeship", discountValue: 0, maxDiscount: 20_000 },
        0,
        35_000,
      ),
    ).toBe(20_000);
  });
});
