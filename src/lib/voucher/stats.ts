import mongoose from "mongoose";
import Order from "@/model/order.model";
import UserVoucher, { UserVoucherStatus } from "@/model/userVoucher.model";

export type VoucherStats = {
  walletCount: number;
  collectedCount: number;
  reservedCount: number;
  usedCount: number;
  expiredCount: number;
  ordersApplied: number;
  settledOrders: number;
  cancelledOrders: number;
  settledDiscount: number;
  pendingDiscount: number;
  grossSales: number;
  conversionRate: number;
};

export type WalletStatusGroup = {
  voucherId: string;
  status: UserVoucherStatus;
  count: number;
};

export type OrderStatusGroup = {
  voucherId: string;
  orderStatus: string;
  orders: number;
  discount: number;
  gross: number;
};

// delivered = đã chốt; pending/confirmed/shipped = còn treo; cancelled không tính vào settled.
const SETTLED_STATUSES = new Set(["delivered"]);
const PENDING_STATUSES = new Set(["pending", "confirmed", "shipped"]);

export function emptyStats(): VoucherStats {
  return {
    walletCount: 0,
    collectedCount: 0,
    reservedCount: 0,
    usedCount: 0,
    expiredCount: 0,
    ordersApplied: 0,
    settledOrders: 0,
    cancelledOrders: 0,
    settledDiscount: 0,
    pendingDiscount: 0,
    grossSales: 0,
    conversionRate: 0,
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// Pure: gộp kết quả aggregate (ví -> theo status, order -> theo orderStatus) thành
// stats mỗi voucher. Tách riêng để unit-test không cần DB.
export function computeVoucherStats(
  voucherIds: string[],
  wallet: WalletStatusGroup[],
  orders: OrderStatusGroup[],
): Map<string, VoucherStats> {
  const result = new Map<string, VoucherStats>();
  for (const id of voucherIds) result.set(id, emptyStats());

  for (const row of wallet) {
    const stats = result.get(row.voucherId);
    if (!stats) continue;
    stats.walletCount += row.count;
    if (row.status === "collected") stats.collectedCount += row.count;
    else if (row.status === "reserved") stats.reservedCount += row.count;
    else if (row.status === "used") stats.usedCount += row.count;
    else if (row.status === "expired") stats.expiredCount += row.count;
  }

  for (const row of orders) {
    const stats = result.get(row.voucherId);
    if (!stats) continue;
    stats.ordersApplied += row.orders;
    stats.grossSales += row.gross;
    if (SETTLED_STATUSES.has(row.orderStatus)) {
      stats.settledOrders += row.orders;
      stats.settledDiscount += row.discount;
    } else if (PENDING_STATUSES.has(row.orderStatus)) {
      stats.pendingDiscount += row.discount;
    }
    if (row.orderStatus === "cancelled") stats.cancelledOrders += row.orders;
  }

  for (const stats of result.values()) {
    stats.conversionRate =
      stats.walletCount > 0 ? round2(stats.usedCount / stats.walletCount) : 0;
  }
  return result;
}

// Aggregate stats từ DB cho danh sách voucher (đã lọc quyền ở caller admin/vendor).
export async function buildVoucherStats(
  voucherIds: string[],
): Promise<Map<string, VoucherStats>> {
  if (voucherIds.length === 0) return new Map();
  const objectIds = voucherIds.map((id) => new mongoose.Types.ObjectId(id));

  const walletAgg = await UserVoucher.aggregate<{
    _id: { voucher: mongoose.Types.ObjectId; status: UserVoucherStatus };
    count: number;
  }>([
    { $match: { voucher: { $in: objectIds } } },
    { $group: { _id: { voucher: "$voucher", status: "$status" }, count: { $sum: 1 } } },
  ]);

  const orderAgg = await Order.aggregate<{
    _id: { voucher: mongoose.Types.ObjectId; status: string };
    orders: number;
    discount: number;
    gross: number;
  }>([
    { $match: { "appliedVouchers.voucher": { $in: objectIds } } },
    { $unwind: "$appliedVouchers" },
    { $match: { "appliedVouchers.voucher": { $in: objectIds } } },
    {
      $group: {
        _id: { voucher: "$appliedVouchers.voucher", status: "$orderStatus" },
        orders: { $sum: 1 },
        discount: { $sum: "$appliedVouchers.amount" },
        gross: { $sum: "$productsTotal" },
      },
    },
  ]);

  const wallet: WalletStatusGroup[] = walletAgg.map((row) => ({
    voucherId: String(row._id.voucher),
    status: row._id.status,
    count: row.count,
  }));
  const orders: OrderStatusGroup[] = orderAgg.map((row) => ({
    voucherId: String(row._id.voucher),
    orderStatus: row._id.status,
    orders: row.orders,
    discount: row.discount,
    gross: row.gross,
  }));

  return computeVoucherStats(voucherIds, wallet, orders);
}
