// Type thuần (không import model) để cả server (candidates.ts) và client
// (VoucherPicker) dùng chung mô tả voucher candidate ở checkout.

export type CandidateSlot = "shop" | "platform" | "freeship";

export type CandidateReason =
  | "not_collected"
  | "not_started"
  | "expired"
  | "quota_exhausted"
  | "wrong_vendor"
  | "wrong_slot"
  | "min_spend"
  | "not_applicable"
  | "reserved"
  | "used";

export type WalletVoucherStatus = "collected" | "reserved" | "used" | "expired";

export type VoucherCandidate = {
  voucherId: string;
  code: string;
  title: string;
  description?: string;
  discountType: "fixed" | "percentage" | "freeship";
  discountValue: number;
  maxDiscount?: number;
  minSpend: number;
  endAt?: string;
  slot: CandidateSlot;
  vendorId: string | null;
  eligible: boolean;
  reason?: CandidateReason;
  estimatedDiscount: number;
  missingAmount: number;
  collected: boolean;
  walletStatus: WalletVoucherStatus | null;
};
