import type { CandidateSlot } from "./candidateTypes";

const STORAGE_KEY = "ecoshopPreferredVoucher";

type VoucherSlotSource = {
  code: string;
  discountType: "fixed" | "percentage" | "freeship";
  vendor?: unknown;
};

export type PreferredVoucher = {
  code: string;
  slot?: CandidateSlot;
};

function isCandidateSlot(value: unknown): value is CandidateSlot {
  return value === "shop" || value === "platform" || value === "freeship";
}

export function inferVoucherSlot(voucher: Pick<VoucherSlotSource, "discountType" | "vendor">): CandidateSlot {
  if (voucher.discountType === "freeship") return "freeship";
  return voucher.vendor ? "shop" : "platform";
}

export function savePreferredVoucher(voucher: VoucherSlotSource) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        code: voucher.code,
        slot: inferVoucherSlot(voucher),
      }),
    );
  } catch {
    /* ignore storage errors */
  }
}

export function readPreferredVoucher(): PreferredVoucher | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    if (typeof record.code !== "string" || record.code.trim() === "") {
      return null;
    }

    return {
      code: record.code.trim(),
      ...(isCandidateSlot(record.slot) ? { slot: record.slot } : {}),
    };
  } catch {
    return null;
  }
}

export function clearPreferredVoucher() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore storage errors */
  }
}
