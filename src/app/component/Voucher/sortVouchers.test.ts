import { describe, expect, it } from "vitest";
import { sortVouchers } from "./sortVouchers";

describe("sortVouchers", () => {
  it("puts no-minSpend vouchers before ones with a threshold", () => {
    const out = sortVouchers([
      { discountType: "fixed", discountValue: 10_000, minSpend: 50_000 },
      { discountType: "fixed", discountValue: 5_000, minSpend: 0 },
    ]);
    expect(out[0].minSpend).toBe(0);
  });

  it("orders by higher discount when the threshold ties", () => {
    const out = sortVouchers([
      { discountType: "fixed", discountValue: 10_000, minSpend: 0 },
      { discountType: "fixed", discountValue: 30_000, minSpend: 0 },
    ]);
    expect(out[0].discountValue).toBe(30_000);
  });

  it("orders by lower threshold when discount ties", () => {
    const out = sortVouchers([
      { discountType: "fixed", discountValue: 10_000, minSpend: 100_000 },
      { discountType: "fixed", discountValue: 10_000, minSpend: 50_000 },
    ]);
    expect(out[0].minSpend).toBe(50_000);
  });

  it("orders by nearer expiry as the final tiebreaker (FOMO)", () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const later = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const out = sortVouchers([
      { discountType: "fixed", discountValue: 10_000, minSpend: 0, endAt: later },
      { discountType: "fixed", discountValue: 10_000, minSpend: 0, endAt: soon },
    ]);
    expect(out[0].endAt).toBe(soon);
  });

  it("unwraps wallet rows shaped as { voucher }", () => {
    const out = sortVouchers([
      { voucher: { discountType: "fixed", discountValue: 5_000, minSpend: 50_000 } },
      { voucher: { discountType: "fixed", discountValue: 5_000, minSpend: 0 } },
    ]);
    expect(out[0].voucher?.minSpend).toBe(0);
  });
});
