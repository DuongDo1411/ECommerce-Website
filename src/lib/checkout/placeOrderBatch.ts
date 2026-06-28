import crypto from "crypto";
import mongoose from "mongoose";
import connectDB from "@/lib/connectDB";
import { reserveQuoteVouchers } from "@/lib/voucher/lifecycle";
import { computeOrderQuote } from "@/lib/voucher/quote";
import CheckoutBatch from "@/model/checkoutBatch.model";
import Order from "@/model/order.model";
import User, { IUser } from "@/model/user.model";
import { deductStockAtomic } from "./stock";
import {
  CheckoutError,
  PlaceOrderBatchInput,
  PlaceOrderBatchResult,
} from "./types";

type AddressSource = NonNullable<IUser["addresses"]>[number];
type CartLine = NonNullable<IUser["cart"]>[number];

type ExistingBatch = {
  checkoutBatchId: string;
  orderIds: mongoose.Types.ObjectId[];
  txnRef?: string;
  amount: number;
  status: string;
};

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

// Snapshot địa chỉ giao vào Order (đóng băng tại thời điểm đặt, không tham chiếu).
function buildAddressSnapshot(src: AddressSource) {
  return {
    name: src.fullName,
    phone: src.phone,
    address: `${src.addressDetail}, ${src.wardName}, ${src.districtName}, ${src.provinceName}`,
    city: src.provinceName,
    pincode: "",
    addressDetail: src.addressDetail,
    wardCode: src.wardCode,
    wardName: src.wardName,
    districtId: src.districtId,
    districtName: src.districtName,
    provinceId: src.provinceId,
    provinceName: src.provinceName,
  };
}

function toResult(batch: ExistingBatch, reused: boolean): PlaceOrderBatchResult {
  return {
    checkoutBatchId: batch.checkoutBatchId,
    orderIds: batch.orderIds.map((id) => id.toString()),
    txnRef: batch.txnRef,
    amount: batch.amount,
    reused,
  };
}

// Service chung cho COD và VNPay: tính quote -> chạy toàn bộ ghi DB trong MỘT
// transaction (reserve voucher, tạo order, trừ stock, dọn cart, push user.orders,
// ghi bản ghi idempotency). Lỗi ở bất kỳ bước nào rollback sạch toàn bộ.
export async function placeOrderBatch(
  input: PlaceOrderBatchInput,
): Promise<PlaceOrderBatchResult> {
  await connectDB();

  const checkoutRequestId = input.checkoutRequestId ?? crypto.randomUUID();

  // (1) Idempotency: nếu (user, checkoutRequestId) đã có batch thì trả lại luôn,
  // không tính quote lại (lúc này cart đã bị dọn nên quote sẽ fail).
  const existing = await CheckoutBatch.findOne({
    user: input.userId,
    checkoutRequestId,
  }).lean<ExistingBatch | null>();
  if (existing) {
    if (existing.status === "created") return toResult(existing, true);
    throw new CheckoutError(
      "checkout_closed",
      "Lượt checkout này đã kết thúc, vui lòng tải lại giỏ hàng",
      409,
      { checkoutBatchId: existing.checkoutBatchId, status: existing.status },
    );
  }

  // (2) Tính quote NGOÀI transaction (có gọi GHN — không đưa I/O ngoài vào transaction).
  const quote = await computeOrderQuote({
    userId: input.userId,
    items: input.items,
    addressId: input.addressId,
    shopVoucherCodes: input.voucherSelection.shopVoucherCodes ?? [],
    platformVoucherCode: input.voucherSelection.platformVoucherCode,
    freeshipVoucherCode: input.voucherSelection.freeshipVoucherCode,
  });

  if (quote.rejected.length > 0) {
    throw new CheckoutError("voucher_rejected", "Voucher không hợp lệ", 400, {
      rejected: quote.rejected,
    });
  }
  if (Math.round(input.clientTotal) !== quote.finalPayable) {
    throw new CheckoutError(
      "price_changed",
      "Giá đã thay đổi, vui lòng tải lại trang",
      400,
    );
  }

  const checkoutBatchId = crypto.randomUUID();
  const txnRef =
    input.paymentMethod === "vnpay"
      ? input.txnRef ?? crypto.randomUUID().replace(/-/g, "").slice(0, 20)
      : undefined;

  const session = await mongoose.startSession();
  let orderIds: string[] = [];

  try {
    await session.withTransaction(async () => {
      // Reset cho trường hợp withTransaction retry callback (transient error).
      orderIds = [];

      const user = await User.findById(input.userId).session(session);
      if (!user) {
        throw new CheckoutError("user_not_found", "Không tìm thấy người dùng", 404);
      }

      const src = (user.addresses ?? []).find(
        (a: AddressSource) => a._id?.toString() === input.addressId.toString(),
      );
      if (!src) {
        throw new CheckoutError(
          "address_not_found",
          "Địa chỉ giao hàng không tồn tại",
          404,
        );
      }
      const address = buildAddressSnapshot(src);

      // Reserve voucher (claim quota atomic + flip UserVoucher) trong transaction.
      await reserveQuoteVouchers({
        userId: input.userId,
        checkoutBatchId,
        txnRef,
        perOrder: quote.perOrder,
        session,
      });

      user.orders = user.orders ?? [];
      const cart = user.cart ?? [];

      for (const item of quote.perOrder) {
        // Verify cart vẫn còn item cần đặt (cart có thể đổi giữa quote và transaction).
        const cartItem = cart.find(
          (ci: CartLine) =>
            ci.product.toString() === item.productId &&
            (ci.size ?? null) === (item.size ?? null),
        );
        if (!cartItem || cartItem.quantity !== item.quantity) {
          throw new CheckoutError(
            "cart_changed",
            "Giỏ hàng đã thay đổi, vui lòng tải lại trang",
            409,
          );
        }

        const [order] = await Order.create(
          [
            {
              buyer: input.userId,
              products: [
                {
                  product: item.productId,
                  quantity: item.quantity,
                  price: item.unitPrice,
                  ...(item.size ? { size: item.size } : {}),
                },
              ],
              productVendor: item.vendorId,
              productsTotal: item.originalTotal,
              originalTotal: item.originalTotal,
              deliveryCharge: item.deliveryCharge,
              serviceCharge: item.serviceCharge,
              shopDiscount: item.shopDiscount,
              platformDiscount: item.platformDiscount,
              freeshipDiscount: item.freeshipDiscount,
              totalDiscount: item.totalDiscount,
              appliedVouchers: item.appliedVouchers,
              totalAmount: item.totalAmount,
              checkoutBatchId,
              paymentMethod: input.paymentMethod,
              isPaid: false,
              orderStatus: "pending",
              returnedAmount: 0,
              address,
              ghn: { serviceId: item.serviceId, visibleToCustomer: false },
              ...(txnRef ? { paymentDetails: { vnpayTxnRef: txnRef } } : {}),
            },
          ],
          { session },
        );

        orderIds.push(order._id.toString());

        await deductStockAtomic({
          productId: item.productId,
          quantity: item.quantity,
          size: item.size ?? null,
          session,
        });

        user.orders.push(order._id);
      }

      // Dọn các item đã đặt khỏi cart.
      user.cart = cart.filter(
        (ci: CartLine) =>
          !quote.perOrder.some(
            (item) =>
              ci.product.toString() === item.productId &&
              (ci.size ?? null) === (item.size ?? null),
          ),
      );
      await user.save({ session });

      // Bản ghi idempotency. Trùng (user, checkoutRequestId) -> E11000 -> rollback.
      await CheckoutBatch.create(
        [
          {
            user: input.userId,
            checkoutRequestId,
            checkoutBatchId,
            paymentMethod: input.paymentMethod,
            orderIds,
            txnRef,
            amount: quote.finalPayable,
            status: "created",
          },
        ],
        { session },
      );
    });
  } catch (error) {
    // Double-submit chạy song song: request kia đã commit batch trước -> trả batch cũ.
    if (isDuplicateKeyError(error)) {
      const racer = await CheckoutBatch.findOne({
        user: input.userId,
        checkoutRequestId,
      }).lean<ExistingBatch | null>();
      if (racer?.status === "created") return toResult(racer, true);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return {
    checkoutBatchId,
    orderIds,
    txnRef,
    amount: quote.finalPayable,
    quote,
    reused: false,
  };
}
