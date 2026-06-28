import { describe, expect, it } from "vitest";
import {
  computeVoucherStats,
  emptyStats,
  type OrderStatusGroup,
  type WalletStatusGroup,
} from "./stats";

const V = "voucher-1";

describe("computeVoucherStats", () => {
  it("đếm wallet theo từng status", () => {
    const wallet: WalletStatusGroup[] = [
      { voucherId: V, status: "collected", count: 5 },
      { voucherId: V, status: "reserved", count: 2 },
      { voucherId: V, status: "used", count: 3 },
      { voucherId: V, status: "expired", count: 1 },
    ];
    const stats = computeVoucherStats([V], wallet, []).get(V)!;
    expect(stats.walletCount).toBe(11);
    expect(stats.collectedCount).toBe(5);
    expect(stats.reservedCount).toBe(2);
    expect(stats.usedCount).toBe(3);
    expect(stats.expiredCount).toBe(1);
    expect(stats.conversionRate).toBe(0.27); // 3/11 = 0.2727 -> 0.27
  });

  it("settledDiscount chỉ tính delivered; pending cho pending/confirmed/shipped; cancelled không vào settled", () => {
    const orders: OrderStatusGroup[] = [
      { voucherId: V, orderStatus: "delivered", orders: 2, discount: 40_000, gross: 400_000 },
      { voucherId: V, orderStatus: "pending", orders: 1, discount: 10_000, gross: 100_000 },
      { voucherId: V, orderStatus: "confirmed", orders: 1, discount: 5_000, gross: 50_000 },
      { voucherId: V, orderStatus: "shipped", orders: 1, discount: 5_000, gross: 50_000 },
      { voucherId: V, orderStatus: "cancelled", orders: 3, discount: 30_000, gross: 300_000 },
    ];
    const stats = computeVoucherStats([V], [], orders).get(V)!;

    expect(stats.settledOrders).toBe(2);
    expect(stats.settledDiscount).toBe(40_000);
    expect(stats.pendingDiscount).toBe(20_000); // 10k + 5k + 5k
    expect(stats.cancelledOrders).toBe(3);
    // cancelled không cộng vào settled/pending discount
    expect(stats.settledDiscount + stats.pendingDiscount).toBe(60_000);
    expect(stats.ordersApplied).toBe(8); // 2+1+1+1+3
    expect(stats.grossSales).toBe(900_000); // tất cả status có dùng voucher
  });

  it("voucher không có dữ liệu trả về emptyStats", () => {
    const result = computeVoucherStats(["a", "b"], [], []);
    expect(result.get("a")).toEqual(emptyStats());
    expect(result.get("b")).toEqual(emptyStats());
  });

  it("bỏ qua row của voucher ngoài danh sách", () => {
    const wallet: WalletStatusGroup[] = [
      { voucherId: "other", status: "collected", count: 9 },
      { voucherId: V, status: "used", count: 1 },
    ];
    const result = computeVoucherStats([V], wallet, []);
    expect(result.has("other")).toBe(false);
    expect(result.get(V)!.usedCount).toBe(1);
    expect(result.get(V)!.walletCount).toBe(1);
  });
});
