import type { PaginationMeta } from "./query";

export type PublicWalletStatus = "collected" | "reserved" | "used" | "expired";

// Shape voucher public trả từ GET /api/vouchers (dùng chung Hub/Strip/PDP/cart).
export type PublicVoucher = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  discountType: "fixed" | "percentage" | "freeship";
  discountValue: number;
  maxDiscount?: number;
  minSpend?: number;
  endAt?: string;
  vendor?: string | null;
  collected?: boolean;
  walletStatus?: PublicWalletStatus;
};

export type PublicVouchersResponse = {
  vouchers: PublicVoucher[];
  pagination?: PaginationMeta;
};
