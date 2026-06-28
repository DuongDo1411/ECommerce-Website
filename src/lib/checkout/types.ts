import type { OrderQuote, RejectedVoucher } from "@/lib/voucher/quote";

export type PaymentMethod = "cod" | "vnpay";

export type PlaceOrderItem = {
  productId: string;
  quantity: number;
  size?: string;
};

export type VoucherSelectionInput = {
  shopVoucherCodes?: string[];
  platformVoucherCode?: string;
  freeshipVoucherCode?: string;
};

export type PlaceOrderBatchInput = {
  userId: string;
  items: PlaceOrderItem[];
  addressId: string;
  clientTotal: number;
  paymentMethod: PaymentMethod;
  voucherSelection: VoucherSelectionInput;
  // Idempotency key sinh từ client. Nếu thiếu, service tự sinh (mất khả năng
  // chống double-submit cho request đó nhưng vẫn an toàn giao dịch).
  checkoutRequestId?: string;
  // Cho phép caller VNPay truyền sẵn txnRef; nếu thiếu service tự sinh.
  txnRef?: string;
};

export type PlaceOrderBatchResult = {
  checkoutBatchId: string;
  orderIds: string[];
  txnRef?: string;
  amount: number;
  // Quote chỉ có khi tạo batch mới; với batch tái dùng (idempotent) sẽ là undefined.
  quote?: OrderQuote;
  reused: boolean;
};

export type CheckoutErrorCode =
  | "invalid_input"
  | "voucher_rejected"
  | "price_changed"
  | "address_not_found"
  | "user_not_found"
  | "cart_changed"
  | "insufficient_stock"
  | "voucher_unavailable"
  | "checkout_closed";

// Lỗi nghiệp vụ checkout có status HTTP + payload đi kèm, để route map thẳng ra
// response thay vì đoán bằng message.
export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  readonly status: number;
  readonly details?: { rejected?: RejectedVoucher[]; [key: string]: unknown };

  constructor(
    code: CheckoutErrorCode,
    message: string,
    status: number,
    details?: CheckoutError["details"],
  ) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
