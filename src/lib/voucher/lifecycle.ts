import type { ClientSession } from "mongoose";
import CheckoutBatch from "@/model/checkoutBatch.model";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import UserVoucher from "@/model/userVoucher.model";
import "@/model/voucher.model";
import { PerOrderQuote } from "./quote";
import { claimVoucherSlot, releaseVoucherSlot } from "./quota";

type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "returned"
  | "delivery_exception"
  | "cancelled";

type VoucherRef = unknown;

type LifecycleOrder = {
  orderStatus: OrderStatus;
  appliedVouchers?: { voucher?: VoucherRef }[];
  deliveryDate?: Date | null;
};

type ReservedVoucherRow = {
  _id: unknown;
  voucher?: VoucherRef;
};

type StaleOrderLine = {
  product: VoucherRef;
  quantity: number;
  size?: string | null;
};

type StaleOrder = {
  products: StaleOrderLine[];
  orderStatus: OrderStatus;
  cancelledAt?: Date;
  checkoutBatchId?: string;
  save: () => Promise<unknown>;
};

function refToString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const maybeToHexString = (value as { toHexString?: unknown }).toHexString;
    if (typeof maybeToHexString === "function") {
      return maybeToHexString.call(value);
    }

    if ("_id" in value) {
      const nestedValue = (value as { _id?: unknown })._id;
      const nested = nestedValue === value ? null : refToString(nestedValue);
      if (nested) return nested;
    }

    const maybeToString = (value as { toString?: unknown }).toString;
    if (typeof maybeToString === "function") {
      const stringValue = maybeToString.call(value);
      if (stringValue && stringValue !== "[object Object]") return stringValue;
    }
  }
  return null;
}

function refEndAt(value: unknown) {
  if (value && typeof value === "object" && "endAt" in value) {
    const endAt = (value as { endAt?: unknown }).endAt;
    if (endAt instanceof Date) return endAt;
    if (typeof endAt === "string") return new Date(endAt);
  }
  return undefined;
}

function isTerminalOrder(order: LifecycleOrder) {
  return (
    order.orderStatus === "delivered" ||
    order.orderStatus === "cancelled" ||
    order.orderStatus === "returned"
  );
}

// Một đơn "từng giao thành công" nếu đang delivered HOẶC đã có deliveryDate —
// đơn delivered-rồi-returned vẫn tính là đã dùng voucher (không trả lại voucher).
function orderWasDelivered(order: LifecycleOrder) {
  return order.orderStatus === "delivered" || !!order.deliveryDate;
}

function voucherUsedByDeliveredOrder(orders: LifecycleOrder[], voucherId: string) {
  return orders.some(
    (order) =>
      orderWasDelivered(order) &&
      (order.appliedVouchers ?? []).some(
        (applied) => refToString(applied.voucher) === voucherId,
      ),
  );
}

export function getTerminalVoucherSettlement(
  orders: LifecycleOrder[],
  voucherId: string,
) {
  if (orders.length === 0 || !orders.every(isTerminalOrder)) return "pending";
  return voucherUsedByDeliveredOrder(orders, voucherId) ? "used" : "release";
}

async function releaseReservedVoucherRow(
  row: ReservedVoucherRow,
  now = new Date(),
  session?: ClientSession,
) {
  const voucherId = refToString(row.voucher);
  const endAt = refEndAt(row.voucher);
  const nextStatus = endAt && endAt >= now ? "collected" : "expired";
  const updated = await UserVoucher.updateOne(
    { _id: row._id, status: "reserved" },
    {
      $set: { status: nextStatus },
      $unset: { checkoutBatchId: "", reservedAt: "", txnRef: "" },
    },
    { session },
  );
  if (updated.modifiedCount === 1 && voucherId) {
    await releaseVoucherSlot(voucherId, session);
  }
}

async function restoreOrderStock(order: StaleOrder) {
  for (const item of order.products) {
    const productId = refToString(item.product);
    if (!productId) continue;
    const size = item.size ?? null;

    if (size) {
      await Product.findByIdAndUpdate(
        productId,
        { $inc: { "sizeStock.$[elem].stock": item.quantity, stock: item.quantity } },
        { arrayFilters: [{ "elem.size": size }] },
      );
    } else {
      await Product.findByIdAndUpdate(productId, { $inc: { stock: item.quantity } });
    }
    await Product.findByIdAndUpdate(productId, { isStockAvailable: true });
  }
}

export function collectAppliedVoucherIds(perOrder: PerOrderQuote[]) {
  const ids = new Set<string>();
  for (const order of perOrder) {
    for (const voucher of order.appliedVouchers) ids.add(voucher.voucher);
  }
  return [...ids];
}

export async function reserveQuoteVouchers(params: {
  userId: string;
  checkoutBatchId: string;
  txnRef?: string;
  perOrder: PerOrderQuote[];
  session?: ClientSession;
}) {
  const voucherIds = collectAppliedVoucherIds(params.perOrder);
  const now = new Date();
  const { session } = params;

  // Claim quota (atomic) rồi chuyển UserVoucher từ collected -> reserved cho một
  // voucher. Throw nếu bất kỳ bước nào fail.
  const claimAndReserve = async (voucherId: string) => {
    const claimed = await claimVoucherSlot(voucherId, session);
    if (!claimed) {
      throw new Error("Voucher da het luot hoac khong kha dung");
    }

    const updated = await UserVoucher.updateOne(
      { user: params.userId, voucher: voucherId, status: "collected" },
      {
        $set: {
          status: "reserved",
          checkoutBatchId: params.checkoutBatchId,
          reservedAt: now,
          ...(params.txnRef ? { txnRef: params.txnRef } : {}),
        },
      },
      { session },
    );

    if (updated.modifiedCount !== 1) {
      // Ngoài transaction phải tự nhả slot vừa claim; trong transaction để
      // rollback tự lo.
      if (!session) await releaseVoucherSlot(voucherId);
      throw new Error("Voucher khong nam trong vi hoac da duoc su dung");
    }
  };

  // Trong transaction: throw sẽ abort toàn bộ giao dịch nên không cần bù trừ thủ công.
  if (session) {
    for (const voucherId of voucherIds) {
      await claimAndReserve(voucherId);
    }
    return;
  }

  // Ngoài transaction: tự rollback từng voucher đã reserve nếu lỗi giữa chừng.
  const reserved: string[] = [];
  try {
    for (const voucherId of voucherIds) {
      await claimAndReserve(voucherId);
      reserved.push(voucherId);
    }
  } catch (error) {
    // Bọc try/catch riêng để một lần rollback lỗi không làm dừng việc rollback
    // các voucher còn lại (tránh orphan).
    for (const voucherId of reserved) {
      try {
        await UserVoucher.updateOne(
          {
            user: params.userId,
            voucher: voucherId,
            checkoutBatchId: params.checkoutBatchId,
            status: "reserved",
          },
          {
            $set: { status: "collected" },
            $unset: { checkoutBatchId: "", reservedAt: "", txnRef: "" },
          },
        );
        await releaseVoucherSlot(voucherId);
      } catch (rollbackError) {
        console.error("[voucher] rollback failed for", voucherId, rollbackError);
      }
    }
    throw error;
  }
}

export async function releaseReservedVouchersForBatch(
  checkoutBatchId: string,
  session?: ClientSession,
) {
  const query = UserVoucher.find({
    checkoutBatchId,
    status: "reserved",
  }).populate("voucher");
  if (session) query.session(session);
  const rows = await query;

  const now = new Date();
  for (const row of rows) {
    await releaseReservedVoucherRow(row as ReservedVoucherRow, now, session);
  }
}

export async function releaseBatchIfFullyCancelled(
  checkoutBatchId?: string,
  finalStatus: "cancelled" | "expired" = "cancelled",
  session?: ClientSession,
) {
  if (!checkoutBatchId) return false;
  const orderQuery = Order.find({ checkoutBatchId }).select(
    "orderStatus deliveryDate",
  );
  if (session) orderQuery.session(session);
  const orders = await orderQuery.lean<LifecycleOrder[]>();
  if (orders.length === 0) return false;

  // Đơn "returned" cũng là terminal → không tính là active, để batch toàn
  // returned/cancelled vẫn được release voucher còn reserved.
  const active = orders.filter(
    (order) =>
      order.orderStatus !== "cancelled" && order.orderStatus !== "returned",
  );
  if (active.length > 0) return false;

  // Batch từng có đơn giao THÀNH CÔNG rồi mới trả hàng thì không phải "hủy sạch":
  // voucher đã tiêu đúng lúc giao và phải giữ nguyên "used". Nhường việc cho
  // commitBatchIfTerminalWithDelivery — nếu không, batch bị lật paid → cancelled.
  if (orders.some(orderWasDelivered)) return false;

  await releaseReservedVouchersForBatch(checkoutBatchId, session);
  await CheckoutBatch.updateOne(
    { checkoutBatchId },
    { $set: { status: finalStatus } },
    { session },
  );
  return true;
}

export async function commitBatchIfTerminalWithDelivery(
  checkoutBatchId?: string,
  session?: ClientSession,
) {
  if (!checkoutBatchId) return false;
  const orderQuery = Order.find({ checkoutBatchId }).select(
    "orderStatus appliedVouchers deliveryDate",
  );
  if (session) orderQuery.session(session);
  const orders = await orderQuery.lean<LifecycleOrder[]>();
  if (orders.length === 0 || !orders.every(isTerminalOrder)) return false;
  if (!orders.some(orderWasDelivered)) return false;

  const rowsQuery = UserVoucher.find({
    checkoutBatchId,
    status: "reserved",
  }).populate("voucher");
  if (session) rowsQuery.session(session);
  const rows = await rowsQuery.lean<ReservedVoucherRow[]>();
  const now = new Date();
  let settled = false;

  for (const row of rows) {
    const voucherId = refToString(row.voucher);
    if (!voucherId) continue;
    const settlement = getTerminalVoucherSettlement(orders, voucherId);
    if (settlement === "used") {
      const updated = await UserVoucher.updateOne(
        { _id: row._id, status: "reserved" },
        {
          $set: { status: "used", usedAt: now },
          $unset: { checkoutBatchId: "", reservedAt: "", txnRef: "" },
        },
        { session },
      );
      if (updated.modifiedCount === 1) settled = true;
    } else if (settlement === "release") {
      await releaseReservedVoucherRow(row, now, session);
      settled = true;
    }
  }

  const paidBatch = await CheckoutBatch.updateOne(
    { checkoutBatchId },
    { $set: { status: "paid" } },
    { session },
  );

  return settled || paidBatch.modifiedCount === 1;
}

// B1 — Khi hủy một đơn đã thanh toán, đánh dấu cần hoàn tiền (không xử lý hoàn
// tiền thật ở đây). Gọi trên order doc đang mở trước khi save().
export function markRefundForCancelledOrder(order: {
  isPaid?: boolean;
  totalAmount?: number;
  returnedAmount?: number;
  refundStatus?: string;
}) {
  if (order.isPaid && (!order.refundStatus || order.refundStatus === "none")) {
    order.returnedAmount = order.totalAmount ?? 0;
    order.refundStatus = "pending";
  }
}

// B2 — Dọn các đơn VNPay chưa thanh toán bị bỏ dở quá hạn: hủy đơn, hoàn tồn
// kho, và release voucher đã reserve theo batch. Idempotent (chỉ chạm đơn
// pending/chưa trả, và release chỉ tác động UserVoucher còn "reserved").
export async function releaseStaleVnpayOrders(olderThanMinutes = 15) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  return releaseStalePendingOrders("vnpay", cutoff);
}

export async function releaseStaleCodOrders(olderThanHours = 48) {
  const cutoff = new Date(Date.now() - olderThanHours * 60 * 60_000);
  return releaseStalePendingOrders("cod", cutoff);
}

async function releaseStalePendingOrders(paymentMethod: "cod" | "vnpay", cutoff: Date) {
  const stale = await Order.find({
    paymentMethod,
    isPaid: false,
    orderStatus: "pending",
    createdAt: { $lt: cutoff },
  });

  let cancelledOrders = 0;
  const batches = new Set<string>();

  for (const order of stale as StaleOrder[]) {
    await restoreOrderStock(order);
    order.orderStatus = "cancelled";
    order.cancelledAt = new Date();
    await order.save();
    cancelledOrders++;
    if (order.checkoutBatchId) batches.add(order.checkoutBatchId);
  }

  let releasedBatches = 0;
  let settledBatches = 0;
  for (const batchId of batches) {
    const released = await releaseBatchIfFullyCancelled(batchId, "expired");
    if (released) releasedBatches++;
    if (!released) {
      const settled = await commitBatchIfTerminalWithDelivery(batchId);
      if (settled) settledBatches++;
    }
  }

  return { cancelledOrders, releasedBatches, settledBatches };
}
