"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaBoxOpen,
  FaCheckCircle,
  FaClipboardList,
  FaCreditCard,
  FaMoneyBillWave,
  FaPhoneAlt,
  FaSave,
  FaSearch,
  FaTimes,
  FaTruck,
  FaUser,
} from "react-icons/fa";
import { MdPendingActions } from "react-icons/md";

/* ─── Types ─── */
interface OrderProduct {
  product: { _id: string; title: string; image1: string; price: number } | null;
  quantity: number;
  price: number;
}

interface VendorOrder {
  _id: string;
  buyer: { name?: string; phone?: string } | null;
  products: OrderProduct[];
  paymentMethod: "cod" | "stripe";
  isPaid: boolean;
  orderStatus:
    | "pending"
    | "confirmed"
    | "shipped"
    | "delivered"
    | "returned"
    | "cancelled";
  totalAmount: number;
  createdAt: string;
  ghn?: {
    orderCode?: string;
    fee?: number;
    status?: string;
  };
}

/* ─── Config ─── */
const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  pending: {
    label: "Đang chờ",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  confirmed: {
    label: "Đã xác nhận",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  shipped: {
    label: "Đã giao ĐVVC",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
  },
  delivered: {
    label: "Đã giao",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  returned: {
    label: "Đã trả hàng",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
  },
  cancelled: {
    label: "Đã hủy",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Chờ duyệt",
  confirmed: "Xác nhận (tạo vận đơn GHN)",
  shipped: "Đã giao cho ĐVVC",
  delivered: "Đã giao",
  returned: "Đã trả hàng",
  cancelled: "Hủy đơn",
};

// Allowed target states the vendor may move TO from the current state.
function allowedTransitions(current: string): string[] {
  if (current === "pending") return ["confirmed", "cancelled"];
  if (current === "confirmed") return ["shipped", "cancelled"];
  if (current === "shipped") return ["delivered", "cancelled"];
  return []; // delivered/returned/cancelled → vendor is done
}

/* ─── Helpers ─── */
function fmt(n: number) {
  return n.toLocaleString("vi-VN") + "₫";
}

function shortId(id: string) {
  return "#" + id.slice(-8).toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ══════════════════════════════════════════ */
function VendorOrders() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  /* per-row: selected status & saving state */
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  /* ── Fetch ── */
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vendor/orders");
      const data = await res.json();
      const list: VendorOrder[] = data.orders ?? [];
      setOrders(list);
      /* initialise selected map */
      const init: Record<string, string> = {};
      list.forEach((o) => (init[o._id] = o.orderStatus));
      setSelected(init);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  /* ── Update status ── */
  const handleSave = async (orderId: string) => {
    const newStatus = selected[orderId];
    setSaving((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await fetch(`/api/vendor/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: newStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Cập nhật thất bại");
      }
      // Refetch to pick up the GHN order code created on confirm.
      await fetchOrders();
      showToast(
        orderId,
        newStatus === "confirmed"
          ? "Đã xác nhận & tạo vận đơn GHN!"
          : "Cập nhật trạng thái thành công!",
        true,
      );
    } catch (e: any) {
      showToast(orderId, e?.message ?? "Cập nhật thất bại", false);
      // Revert the dropdown to the real status.
      setSelected((prev) => {
        const cur = orders.find((o) => o._id === orderId)?.orderStatus;
        return cur ? { ...prev, [orderId]: cur } : prev;
      });
    } finally {
      setSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const [labelLoading, setLabelLoading] = useState<Record<string, boolean>>({});
  const handlePrintLabel = async (orderId: string) => {
    setLabelLoading((p) => ({ ...p, [orderId]: true }));
    try {
      const res = await fetch(`/api/vendor/orders/${orderId}/label`);
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data?.message ?? "Không lấy được nhãn in");
      }
      window.open(data.url, "_blank");
    } catch (e: any) {
      showToast(orderId, e?.message ?? "Lỗi in nhãn", false);
    } finally {
      setLabelLoading((p) => ({ ...p, [orderId]: false }));
    }
  };

  const showToast = (id: string, msg: string, ok: boolean) => {
    setToast({ id, msg, ok });
    setTimeout(() => setToast(null), 2500);
  };

  /* ── Filter states ── */
  const [searchText, setSearchText] = useState("");
  const [filterDate, setFilterDate] = useState<"all" | "today" | "week" | "month">("all");
  const [filterPayment, setFilterPayment] = useState<"all" | "cod" | "vnpay">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | VendorOrder["orderStatus"]>("all");

  /* ── Derived: filtered orders ── */
  const filteredOrders = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return orders.filter((order) => {
      if (q) {
        const matchId = order._id.toLowerCase().includes(q);
        const matchBuyer =
          (order.buyer?.name || "").toLowerCase().includes(q) ||
          (order.buyer?.phone || "").toLowerCase().includes(q);
        const matchProduct = order.products.some((p) =>
          p.product?.title?.toLowerCase().includes(q),
        );
        if (!matchId && !matchBuyer && !matchProduct) return false;
      }
      if (filterDate !== "all") {
        const orderDate = new Date(order.createdAt);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (filterDate === "today" && orderDate < today) return false;
        if (filterDate === "week") {
          const cut = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (orderDate < cut) return false;
        }
        if (filterDate === "month") {
          const cut = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (orderDate < cut) return false;
        }
      }
      if (filterPayment !== "all" && order.paymentMethod !== filterPayment) return false;
      if (filterStatus !== "all" && order.orderStatus !== filterStatus) return false;
      return true;
    });
  }, [orders, searchText, filterDate, filterPayment, filterStatus]);

  const activeFilterCount = [
    searchText !== "",
    filterDate !== "all",
    filterPayment !== "all",
    filterStatus !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchText("");
    setFilterDate("all");
    setFilterPayment("all");
    setFilterStatus("all");
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Đang tải đơn hàng...</p>
        </div>
      </div>
    );
  }

  /* ── Empty ── */
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
        <FaClipboardList size={52} className="text-gray-700" />
        <p className="text-lg font-medium">Chưa có đơn hàng nào</p>
        <p className="text-sm text-gray-600">
          Các đơn hàng từ khách sẽ xuất hiện ở đây
        </p>
      </div>
    );
  }

  /* ── Main ── */
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-6 bg-emerald-500 rounded-full" />
        <h2 className="text-xl font-bold text-white">Quản lý đơn hàng</h2>
        <span className="text-xs text-gray-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
          {filteredOrders.length !== orders.length
            ? `${filteredOrders.length} / ${orders.length} đơn`
            : `${orders.length} đơn`}
        </span>
      </div>

      {/* ── Search + Filters ── */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <FaSearch
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            size={13}
          />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm theo mã đơn, tên buyer, số điện thoại, sản phẩm..."
            className="w-full pl-9 pr-9 py-2.5 bg-gray-900/60 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              <FaTimes size={12} />
            </button>
          )}
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Date */}
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value as typeof filterDate)}
            className={`bg-gray-900/60 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
              filterDate !== "all"
                ? "border-emerald-500/60 text-emerald-300"
                : "border-white/10 text-gray-400 hover:border-white/20"
            }`}
          >
            <option value="all">Tất cả ngày</option>
            <option value="today">Hôm nay</option>
            <option value="week">7 ngày qua</option>
            <option value="month">30 ngày qua</option>
          </select>

          {/* Payment */}
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value as typeof filterPayment)}
            className={`bg-gray-900/60 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
              filterPayment !== "all"
                ? "border-emerald-500/60 text-emerald-300"
                : "border-white/10 text-gray-400 hover:border-white/20"
            }`}
          >
            <option value="all">Phương thức TT</option>
            <option value="cod">COD</option>
            <option value="vnpay">VNPay</option>
          </select>

          {/* Order status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
            className={`bg-gray-900/60 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
              filterStatus !== "all"
                ? "border-emerald-500/60 text-emerald-300"
                : "border-white/10 text-gray-400 hover:border-white/20"
            }`}
          >
            <option value="all">Trạng thái</option>
            <option value="pending">Đang chờ</option>
            <option value="confirmed">Đã xác nhận</option>
            <option value="shipped">Đã giao ĐVVC</option>
            <option value="delivered">Đã giao</option>
            <option value="returned">Đã trả hàng</option>
            <option value="cancelled">Đã hủy</option>
          </select>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl hover:bg-red-500/20 transition-colors"
            >
              <FaTimes size={10} />
              Xóa bộ lọc ({activeFilterCount})
            </motion.button>
          )}
        </div>
      </div>

      {/* ── Toast notification ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id + toast.msg}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`fixed top-20 right-4 lg:top-6 lg:right-6 z-50 max-w-[calc(100vw-2rem)] px-4 py-3 rounded-xl text-sm font-medium shadow-xl border
              ${toast.ok
                ? "bg-emerald-900/90 border-emerald-500/40 text-emerald-300"
                : "bg-red-900/90 border-red-500/40 text-red-300"
              }`}
          >
            {toast.ok ? "✓ " : "✕ "}{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ DESKTOP table (lg+) ══ */}
      <div className="hidden lg:block overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
              <th className="px-4 py-4 text-left">Order</th>
              <th className="px-4 py-4 text-left">Buyer</th>
              <th className="px-4 py-4 text-left">Sản phẩm</th>
              <th className="px-4 py-4 text-left">Payment</th>
              <th className="px-4 py-4 text-left">Trạng thái</th>
              <th className="px-4 py-4 text-left min-w-[220px]">Cập nhật</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-gray-500 text-sm">Không tìm thấy đơn hàng phù hợp</p>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="mt-2 text-xs text-emerald-400 hover:underline"
                    >
                      Xóa bộ lọc
                    </button>
                  )}
                </td>
              </tr>
            ) : filteredOrders.map((order, i) => {
              const st = STATUS_CONFIG[order.orderStatus] ?? STATUS_CONFIG.pending;
              const isDirty = selected[order._id] !== order.orderStatus;
              return (
                <motion.tr
                  key={order._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-gray-900/40 hover:bg-white/5 transition-colors"
                >
                  {/* Order ID + date */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <p className="font-mono text-xs text-emerald-400 font-bold">
                      {shortId(order._id)}
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {fmtDate(order.createdAt)}
                    </p>
                    {order.ghn?.orderCode && (
                      <div className="mt-1.5">
                        <span className="text-[10px] font-mono bg-orange-500/15 text-orange-300 border border-orange-500/30 px-1.5 py-0.5 rounded">
                          GHN: {order.ghn.orderCode}
                        </span>
                        <button
                          onClick={() => handlePrintLabel(order._id)}
                          disabled={labelLoading[order._id]}
                          className="block mt-1 text-[10px] text-blue-400 hover:underline disabled:opacity-50"
                        >
                          {labelLoading[order._id]
                            ? "Đang lấy nhãn..."
                            : "🖨 In nhãn"}
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Buyer */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                        <FaUser size={11} className="text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">
                          {order.buyer?.name ?? "—"}
                        </p>
                        <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <FaPhoneAlt size={9} className="text-gray-600" />
                          {order.buyer?.phone ?? "—"}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Products */}
                  <td className="px-4 py-4 max-w-[220px]">
                    <div className="space-y-1">
                      {order.products.slice(0, 2).map((p, idx) => (
                        <p key={idx} className="text-xs text-gray-300 truncate">
                          {p.product?.title ?? "Sản phẩm"}{" "}
                          <span className="text-gray-500">×{p.quantity}</span>
                        </p>
                      ))}
                      {order.products.length > 2 && (
                        <p className="text-[10px] text-gray-600">
                          +{order.products.length - 2} sản phẩm khác
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Payment */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/25 rounded-full px-2.5 py-1 w-fit mb-1.5">
                      <FaMoneyBillWave size={10} />
                      {order.paymentMethod.toUpperCase()}
                    </span>
                    {order.isPaid ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                        <FaCheckCircle size={10} /> Paid
                      </span>
                    ) : (
                      <span className="text-[11px] text-yellow-400 font-semibold">
                        ● Pending
                      </span>
                    )}
                  </td>

                  {/* Current status */}
                  <td className="px-4 py-4">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.color} ${st.bg} ${st.border}`}
                    >
                      {st.label}
                    </span>
                  </td>

                  {/* Update */}
                  <td className="px-4 py-4">
                    {(() => {
                      const opts = allowedTransitions(order.orderStatus);
                      if (opts.length === 0) {
                        return (
                          <span className="text-[11px] text-gray-600">
                            Không có thao tác
                          </span>
                        );
                      }
                      return (
                        <div className="flex items-center gap-2">
                          <select
                            value={selected[order._id] ?? order.orderStatus}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [order._id]: e.target.value,
                              }))
                            }
                            className="flex-1 bg-gray-800 border border-white/15 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value={order.orderStatus} disabled>
                              {STATUS_LABEL[order.orderStatus]} (hiện tại)
                            </option>
                            {opts.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <motion.button
                            whileTap={{ scale: 0.93 }}
                            whileHover={{ scale: 1.05 }}
                            onClick={() => handleSave(order._id)}
                            disabled={!isDirty || saving[order._id]}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap
                              ${isDirty && !saving[order._id]
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                                : "bg-white/5 text-gray-600 cursor-not-allowed"
                              }`}
                          >
                            {saving[order._id] ? (
                              <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FaSave size={11} />
                            )}
                            Lưu
                          </motion.button>
                        </div>
                      );
                    })()}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ══ MOBILE / TABLET cards (< lg) ══ */}
      <div className="lg:hidden space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12 bg-gray-900/40 border border-white/10 rounded-2xl">
            <p className="text-gray-500 text-sm">Không tìm thấy đơn hàng phù hợp</p>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="mt-2 text-xs text-emerald-400 hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        ) : filteredOrders.map((order, i) => {
          const st = STATUS_CONFIG[order.orderStatus] ?? STATUS_CONFIG.pending;
          const isDirty = selected[order._id] !== order.orderStatus;
          const isLocked =
            order.orderStatus === "returned" || order.orderStatus === "cancelled";

          return (
            <motion.div
              key={order._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-gray-900/60 border border-white/10 rounded-2xl overflow-hidden"
            >
              {/* Card header */}
              <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/8">
                <div>
                  <p className="font-mono text-xs text-emerald-400 font-bold">
                    {shortId(order._id)}
                  </p>
                  <p className="text-[11px] text-gray-600 mt-0.5">
                    {fmtDate(order.createdAt)}
                  </p>
                  {order.ghn?.orderCode && (
                    <span className="inline-block mt-1 text-[10px] font-mono bg-orange-500/15 text-orange-300 border border-orange-500/30 px-1.5 py-0.5 rounded">
                      GHN: {order.ghn.orderCode}
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.color} ${st.bg} ${st.border}`}
                >
                  {st.label}
                </span>
              </div>

              <div className="px-4 py-3 space-y-3">
                {/* Buyer row */}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <FaUser size={12} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {order.buyer?.name ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <FaPhoneAlt size={9} className="text-gray-600" />
                      {order.buyer?.phone ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Products */}
                <div className="space-y-1.5">
                  {order.products.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {p.product?.image1 && (
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-800 border border-white/10 shrink-0">
                          <img
                            src={p.product.image1}
                            alt={p.product.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <p className="text-xs text-gray-300 truncate flex-1">
                        {p.product?.title ?? "Sản phẩm"}
                        <span className="text-gray-500 ml-1">×{p.quantity}</span>
                      </p>
                    </div>
                  ))}
                </div>

                {/* Payment + total */}
                <div className="flex items-center justify-between pt-1 border-t border-white/8">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/25 rounded-full px-2 py-0.5">
                      <FaMoneyBillWave size={9} />
                      {order.paymentMethod.toUpperCase()}
                    </span>
                    {order.isPaid ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                        <FaCheckCircle size={10} /> Paid
                      </span>
                    ) : (
                      <span className="text-xs text-yellow-400 font-semibold">
                        ● Pending
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-emerald-400 text-sm">
                    {fmt(order.totalAmount)}
                  </span>
                </div>

                {/* Update status */}
                {(() => {
                  const opts = allowedTransitions(order.orderStatus);
                  return (
                    <div className="space-y-2 pt-1">
                      {opts.length === 0 ? (
                        <p className="text-[11px] text-gray-600">
                          Không có thao tác khả dụng
                        </p>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={selected[order._id] ?? order.orderStatus}
                            onChange={(e) =>
                              setSelected((prev) => ({
                                ...prev,
                                [order._id]: e.target.value,
                              }))
                            }
                            className="flex-1 bg-gray-800 border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value={order.orderStatus} disabled>
                              {STATUS_LABEL[order.orderStatus]} (hiện tại)
                            </option>
                            {opts.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <motion.button
                            whileTap={{ scale: 0.93 }}
                            onClick={() => handleSave(order._id)}
                            disabled={!isDirty || saving[order._id]}
                            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap
                              ${isDirty && !saving[order._id]
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                                : "bg-white/5 text-gray-600 cursor-not-allowed"
                              }`}
                          >
                            {saving[order._id] ? (
                              <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FaSave size={11} />
                            )}
                            Lưu
                          </motion.button>
                        </div>
                      )}
                      {order.ghn?.orderCode && (
                        <button
                          onClick={() => handlePrintLabel(order._id)}
                          disabled={labelLoading[order._id]}
                          className="text-xs text-blue-400 hover:underline disabled:opacity-50"
                        >
                          {labelLoading[order._id]
                            ? "Đang lấy nhãn..."
                            : "🖨 In nhãn GHN"}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default VendorOrders;
