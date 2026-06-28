import { IVoucher } from "@/model/voucher.model";
import { clampDiscount } from "./proration";

export function computeDiscount(
  voucher: Pick<IVoucher, "discountType" | "discountValue" | "maxDiscount">,
  eligibleBase: number,
  shippingFee = 0,
): number {
  const base = voucher.discountType === "freeship" ? shippingFee : eligibleBase;
  let raw = 0;

  if (voucher.discountType === "fixed") {
    raw = voucher.discountValue;
  }

  if (voucher.discountType === "percentage") {
    raw = Math.floor((eligibleBase * voucher.discountValue) / 100);
    if (typeof voucher.maxDiscount === "number") {
      raw = Math.min(raw, voucher.maxDiscount);
    }
  }

  if (voucher.discountType === "freeship") {
    raw = voucher.discountValue > 0 ? voucher.discountValue : shippingFee;
    if (typeof voucher.maxDiscount === "number") {
      raw = Math.min(raw, voucher.maxDiscount);
    }
  }

  return clampDiscount(raw, base);
}
