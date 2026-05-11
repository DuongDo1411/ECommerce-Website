"use client";
import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaBoxOpen,
  FaCheckCircle,
  FaClipboardList,
  FaMoneyBillWave,
  FaPhoneAlt,
  FaSave,
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
    label: "Đang vận chuyển",
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

const UPDATABLE_STATUSES = [
  { value: "pending", label: "Đang chờ" },
  { value: "confirmed", label: "Xác nhận" },
  { value: "shipped", label: "Vận chuyển" },
  { value: "delivered", label: "Đã giao" },
  { value: "cancelled", label: "Hủy đơn" },
];

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
      if (!res.ok) throw new Error("Cập nhật thất bại");
      /* optimistic update */
      setOrders((prev) =>
        prev.map((o) =>
          o._id === orderId
            ? { ...o, orderStatus: newStatus as VendorOrder["orderStatus"] }
            : o,
        ),
      );
      showToast(orderId, "Cập nhật trạng thái thành công!", true);
    } catch {
      showToast(orderId, "Cập nhật thất bại, thử lại!", false);
    } finally {
      setSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const showToast = (id: string, msg: string, ok: boolean) => {
    setToast({ id, msg, ok });
    setTimeout(() => setToast(null), 2500);
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
          {orders.length} đơn
        </span>
      </div>

      {/* ── Toast notification ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id + toast.msg}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl border
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
            {orders.map((order, i) => {
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
                    <div className="flex items-center gap-2">
                      <select
                        value={selected[order._id] ?? order.orderStatus}
                        onChange={(e) =>
                          setSelected((prev) => ({
                            ...prev,
                            [order._id]: e.target.value,
                          }))
                        }
                        disabled={
                          order.orderStatus === "returned" ||
                          order.orderStatus === "cancelled"
                        }
                        className="flex-1 bg-gray-800 border border-white/15 text-white text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {UPDATABLE_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <motion.button
                        whileTap={{ scale: 0.93 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => handleSave(order._id)}
                        disabled={
                          !isDirty ||
                          saving[order._id] ||
                          order.orderStatus === "returned" ||
                          order.orderStatus === "cancelled"
                        }
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
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ══ MOBILE / TABLET cards (< lg) ══ */}
      <div className="lg:hidden space-y-3">
        {orders.map((order, i) => {
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
                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={selected[order._id] ?? order.orderStatus}
                    onChange={(e) =>
                      setSelected((prev) => ({
                        ...prev,
                        [order._id]: e.target.value,
                      }))
                    }
                    disabled={isLocked}
                    className="flex-1 bg-gray-800 border border-white/15 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {UPDATABLE_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={() => handleSave(order._id)}
                    disabled={!isDirty || saving[order._id] || isLocked}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap
                      ${isDirty && !saving[order._id] && !isLocked
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
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default VendorOrders;
