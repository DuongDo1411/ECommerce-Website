import { describe, expect, it } from "vitest";
import { prorateInteger } from "./proration";

describe("prorateInteger", () => {
  it("keeps the exact discount total", () => {
    const result = prorateInteger(100_000, [10_000, 20_000, 70_000]);
    expect(result.reduce((sum, amount) => sum + amount, 0)).toBe(100_000);
  });

  it("handles zero weights", () => {
    expect(prorateInteger(100, [0, 0])).toEqual([0, 0]);
    expect(prorateInteger(100, [0, 100])).toEqual([0, 100]);
  });

  it("does not lose odd dong when rounding", () => {
    const result = prorateInteger(10, [1, 1, 1]);
    expect(result.reduce((sum, amount) => sum + amount, 0)).toBe(10);
    expect(Math.max(...result)).toBeLessThanOrEqual(4);
  });
});
