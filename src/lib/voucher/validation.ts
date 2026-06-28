import { VoucherDiscountType, VoucherScope } from "@/model/voucher.model";

export type VoucherPayload = {
  discountType?: VoucherDiscountType;
  discountValue?: number;
  maxDiscount?: number;
  startAt?: string | Date;
  endAt?: string | Date;
  collectStartAt?: string | Date;
  perUserLimit?: number;
  scope?: VoucherScope;
  applicableProducts?: string[];
  applicableCategories?: string[];
};

export function parseOptionalDate(value: unknown) {
  if (!value) return undefined;
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function validateVoucherPayload(
  payload: VoucherPayload,
  current?: {
    discountType?: VoucherDiscountType;
    maxDiscount?: number;
    startAt?: Date;
    endAt?: Date;
    collectStartAt?: Date;
  },
) {
  if (payload.perUserLimit && payload.perUserLimit !== 1) {
    return "Giai doan nay chi ho tro moi user luu 1 voucher";
  }

  const discountType = payload.discountType ?? current?.discountType;
  if (payload.discountValue !== undefined) {
    const value = Number(payload.discountValue);
    if (!Number.isFinite(value)) return "Gia tri giam khong hop le";
    if (discountType === "percentage" && (value <= 0 || value > 100)) {
      return "Voucher phan tram phai lon hon 0 va khong vuot qua 100";
    }
    if (discountType !== "percentage" && value < 0) {
      return "Gia tri giam khong duoc am";
    }
  }

  if (payload.maxDiscount !== undefined && Number(payload.maxDiscount) < 0) {
    return "Tran giam khong duoc am";
  }

  // Voucher % bắt buộc có trần giảm (maxDiscount) > 0 để kiểm soát rủi ro và
  // sắp xếp hiển thị chính xác hơn.
  const effectiveType = payload.discountType ?? current?.discountType;
  const effectiveMax = payload.maxDiscount ?? current?.maxDiscount;
  if (effectiveType === "percentage" && !(Number(effectiveMax) > 0)) {
    return "Voucher phan tram can co tran giam (maxDiscount) lon hon 0";
  }
  // Freeship sàn cũng cần trần giảm > 0 để tránh miễn phí ship không trần.
  if (effectiveType === "freeship" && !(Number(effectiveMax) > 0)) {
    return "Voucher freeship can co tran giam (maxDiscount) lon hon 0";
  }

  const parsedStartAt = parseOptionalDate(payload.startAt);
  const parsedEndAt = parseOptionalDate(payload.endAt);
  const parsedCollectStartAt = parseOptionalDate(payload.collectStartAt);

  if (payload.startAt && !parsedStartAt) return "Ngay bat dau khong hop le";
  if (payload.endAt && !parsedEndAt) return "Ngay ket thuc khong hop le";
  if (payload.collectStartAt && !parsedCollectStartAt) return "Ngay bat dau luu khong hop le";

  const startAt = parsedStartAt ?? current?.startAt;
  const endAt = parsedEndAt ?? current?.endAt;
  const collectStartAt = parsedCollectStartAt ?? current?.collectStartAt;
  if (startAt && endAt && endAt <= startAt) {
    return "Ngay ket thuc phai sau ngay bat dau";
  }
  if (collectStartAt && endAt && collectStartAt > endAt) {
    return "Ngay bat dau luu phai truoc ngay ket thuc";
  }

  if (
    payload.scope === "products" &&
    (!Array.isArray(payload.applicableProducts) ||
      payload.applicableProducts.length === 0)
  ) {
    return "Voucher theo san pham can chon it nhat 1 san pham";
  }

  if (
    payload.scope === "category" &&
    (!Array.isArray(payload.applicableCategories) ||
      payload.applicableCategories.length === 0)
  ) {
    return "Voucher theo danh muc can chon it nhat 1 danh muc";
  }

  return null;
}

export function duplicateKeyStatus(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
    ? 409
    : 500;
}
