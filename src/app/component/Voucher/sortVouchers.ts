export type SortableVoucher = {
  discountType?: "fixed" | "percentage" | "freeship";
  discountValue?: number;
  maxDiscount?: number;
  minSpend?: number;
  endAt?: string | Date;
  voucher?: SortableVoucher;
};

function unwrap(voucher: SortableVoucher) {
  return voucher.voucher ?? voucher;
}

function normalizedValue(voucher: SortableVoucher) {
  const item = unwrap(voucher);
  if (item.discountType === "percentage") {
    return Number(item.maxDiscount ?? item.discountValue ?? 0);
  }
  if (item.discountType === "freeship") {
    return Number(item.maxDiscount ?? item.discountValue ?? 0);
  }
  return Number(item.discountValue ?? 0);
}

function timeValue(voucher: SortableVoucher) {
  const item = unwrap(voucher);
  if (!item.endAt) return Number.MAX_SAFE_INTEGER;
  const time = new Date(item.endAt).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

export function sortVouchers<T extends SortableVoucher>(vouchers: T[]): T[] {
  return [...vouchers].sort((a, b) => {
    const av = unwrap(a);
    const bv = unwrap(b);
    const aNoMin = Number(av.minSpend ?? 0) <= 0 ? 0 : 1;
    const bNoMin = Number(bv.minSpend ?? 0) <= 0 ? 0 : 1;
    if (aNoMin !== bNoMin) return aNoMin - bNoMin;

    const valueDiff = normalizedValue(b) - normalizedValue(a);
    if (valueDiff !== 0) return valueDiff;

    const minDiff = Number(av.minSpend ?? 0) - Number(bv.minSpend ?? 0);
    if (minDiff !== 0) return minDiff;

    return timeValue(a) - timeValue(b);
  });
}
