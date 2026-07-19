import {
  commitBatchIfTerminalWithDelivery,
  releaseBatchIfFullyCancelled,
} from "@/lib/voucher/lifecycle";
import Order from "@/model/order.model";
import Product from "@/model/product.model";
import type { StockDisposition } from "@/model/returnRequest.model";
import type { ClientSession } from "mongoose";
import { withReturnTransaction } from "./transaction";

type StockRestorationReason =
  | "cancelled"
  | "customer_return"
  | "delivery_failure";

type OrderLike = {
  _id: unknown;
  products: { product: unknown; quantity: number; size?: string | null }[];
  checkoutBatchId?: string;
  isPaid?: boolean;
  totalAmount?: number;
  returnedAmount?: number;
  refundStatus?: string;
  orderStatus?: string;
  returnedAt?: Date;
  returnSource?: "customer_return" | "delivery_failure";
};

function idToString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const ref = value as { _id?: unknown; toString?: () => string };
    if (ref._id && ref._id !== value) return idToString(ref._id);
    if (typeof ref.toString === "function") {
      const text = ref.toString();
      if (text && text !== "[object Object]") return text;
    }
  }
  return null;
}

export class StockRestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockRestoreError";
  }
}

export async function assertRestockable(
  order: OrderLike,
  session?: ClientSession,
): Promise<void> {
  for (const item of order.products ?? []) {
    const productId = idToString(item.product);
    if (!productId) {
      throw new StockRestoreError(
        `Đơn ${String(order._id)} có dòng hàng không tham chiếu sản phẩm`,
      );
    }

    const query = Product.findById(productId).select("sizeStock");
    if (session) query.session(session);
    const product = await query.lean<
      { sizeStock?: { size: string }[] } | null
    >();
    if (!product) {
      throw new StockRestoreError(
        `Sản phẩm ${productId} không còn tồn tại, không thể hoàn kho`,
      );
    }

    const size = item.size ?? null;
    if (size && !(product.sizeStock ?? []).some((row) => row.size === size)) {
      throw new StockRestoreError(
        `Sản phẩm ${productId} không còn size "${size}", không thể hoàn kho`,
      );
    }
  }
}

async function restoreStockInTransaction(
  order: OrderLike,
  opts: { reason: StockRestorationReason; disposition?: StockDisposition },
  session: ClientSession,
): Promise<boolean> {
  const disposition = opts.disposition ?? "restock";
  if (disposition === "restock") await assertRestockable(order, session);

  const claim = await Order.updateOne(
    { _id: order._id, stockRestoredAt: { $exists: false } },
    {
      $set: {
        stockRestoredAt: new Date(),
        stockRestorationReason: opts.reason,
        stockDisposition: disposition,
      },
    },
    { session },
  );
  if (claim.modifiedCount !== 1) return false;
  if (disposition !== "restock") return true;

  for (const item of order.products ?? []) {
    const productId = idToString(item.product);
    if (!productId) {
      throw new StockRestoreError("Dòng hàng không có mã sản phẩm");
    }
    const size = item.size ?? null;
    const result = size
      ? await Product.updateOne(
          { _id: productId, "sizeStock.size": size },
          {
            $inc: {
              "sizeStock.$[elem].stock": item.quantity,
              stock: item.quantity,
            },
            $set: { isStockAvailable: true },
          },
          { arrayFilters: [{ "elem.size": size }], session },
        )
      : await Product.updateOne(
          { _id: productId },
          {
            $inc: { stock: item.quantity },
            $set: { isStockAvailable: true },
          },
          { session },
        );

    if (result.matchedCount !== 1) {
      throw new StockRestoreError(
        `Sản phẩm ${productId}${size ? ` size "${size}"` : ""} đã thay đổi trong lúc hoàn kho`,
      );
    }
  }
  return true;
}

export async function restoreOrderStockOnce(
  order: OrderLike,
  opts: { reason: StockRestorationReason; disposition?: StockDisposition },
  session?: ClientSession,
): Promise<boolean> {
  if (session) return restoreStockInTransaction(order, opts, session);
  return withReturnTransaction((tx) => restoreStockInTransaction(order, opts, tx));
}

async function finalizeInTransaction(
  order: OrderLike,
  opts: {
    source: "customer_return" | "delivery_failure";
    disposition?: StockDisposition;
    refundAmount?: number;
  },
  session: ClientSession,
): Promise<void> {
  const freshOrder = await Order.findById(order._id).session(session);
  if (!freshOrder) throw new Error(`Khong tim thay don ${String(order._id)}`);

  if (freshOrder.orderStatus !== "returned") {
    freshOrder.orderStatus = "returned";
    freshOrder.returnedAt = new Date();
    freshOrder.returnSource = opts.source;

    if (
      typeof opts.refundAmount === "number" &&
      freshOrder.isPaid &&
      opts.refundAmount > 0 &&
      (!freshOrder.refundStatus || freshOrder.refundStatus === "none")
    ) {
      freshOrder.returnedAmount = opts.refundAmount;
      freshOrder.refundStatus = "pending";
    }
    await freshOrder.save({ session });
  }

  await restoreStockInTransaction(
    freshOrder as unknown as OrderLike,
    { reason: opts.source, disposition: opts.disposition },
    session,
  );

  const released = await releaseBatchIfFullyCancelled(
    freshOrder.checkoutBatchId,
    "cancelled",
    session,
  );
  if (!released) {
    await commitBatchIfTerminalWithDelivery(freshOrder.checkoutBatchId, session);
  }
}

export async function finalizeReturnedOrder(
  order: OrderLike,
  opts: {
    source: "customer_return" | "delivery_failure";
    disposition?: StockDisposition;
    // Undefined or zero means no refund. Callers must never rely on an implicit full refund.
    refundAmount?: number;
  },
  session?: ClientSession,
): Promise<void> {
  if (session) return finalizeInTransaction(order, opts, session);
  return withReturnTransaction((tx) => finalizeInTransaction(order, opts, tx));
}
