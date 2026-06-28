import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPreferredVoucher,
  inferVoucherSlot,
  readPreferredVoucher,
  savePreferredVoucher,
} from "./preferredVoucher";

function stubSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  return store;
}

describe("preferred voucher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("infers voucher slot from discount type and owner", () => {
    expect(inferVoucherSlot({ discountType: "freeship", vendor: "vendor-1" })).toBe("freeship");
    expect(inferVoucherSlot({ discountType: "fixed", vendor: "vendor-1" })).toBe("shop");
    expect(inferVoucherSlot({ discountType: "percentage", vendor: null })).toBe("platform");
  });

  it("saves, reads and clears the preferred voucher", () => {
    stubSessionStorage();

    savePreferredVoucher({
      code: "SHOP10",
      discountType: "fixed",
      vendor: "vendor-1",
    });

    expect(readPreferredVoucher()).toEqual({ code: "SHOP10", slot: "shop" });

    clearPreferredVoucher();
    expect(readPreferredVoucher()).toBeNull();
  });
});
