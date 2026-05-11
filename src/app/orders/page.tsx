"use client";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  FaBoxOpen,
  FaCheckCircle,
  FaChevronRight,
  FaClipboardList,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaPhoneAlt,
  FaShippingFast,
  FaTimes,
  FaTimesCircle,
  FaTruck,
  FaUndoAlt,
  FaUser,
} from "react-icons/fa";
import { MdPendingActions } from "react-icons/md";

/* ─── Types ─── */
interface OrderProduct {
  product: {
    _id: string;
    title: string;
    image1: string;
    price: number;
  };
  quantity: number;
  price: number;
}

interface IOrder {
  _id: string;
  products: OrderProduct[];
  productVendor: { shopName?: string; name?: string };
  productsTotal: number;
  deliveryCharge: number;
  serviceCharge: number;
  totalAmount: number;
  paymentMethod: "cod" | "stripe";
  orderStatus:
    | "pending"
    | "confirmed"
    | "shipped"
    | "delivered"
    | "returned"
    | "cancelled";
  address: {
    name: string;
    phone: string;
    address: string;
    city: string;
    pincode: string;
  };
  createdAt: string;
}

/* ─── Status config ─── */
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

const TRACKING_STEPS = [
  { key: "pending", label: "Đang chờ xử lý", Icon: MdPendingActions },
  { key: "confirmed", label: "Đã xác nhận", Icon: FaCheckCircle },
  { key: "shipped", label: "Đang vận chuyển", Icon: FaTruck },
  { key: "delivered", label: "Đã giao hàng", Icon: FaBoxOpen },
];

const STEP_ORDER = ["pending", "confirmed", "shipped", "delivered"];

function getStepIndex(status: string) {
  const idx = STEP_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

/* ─── Helpers ─── */
function fmt(n: number) {
  return n.toLocaleString("vi-VN") + "₫";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(id: string) {
  return "#" + id.slice(-8).toUpperCase();
}

/* ══════════════════════════════════════════ */
export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<IOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState<IOrder | null>(null);
  const [trackOrder, setTrackOrder] = useState<IOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setOrders(data.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Đang tải đơn hàng...</p>
        </div>
      </div>
    );
  }

  /* ── Empty ── */
  if (orders.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-6 text-gray-400">
        <FaClipboardList size={64} className="text-gray-700" />
        <p className="text-xl font-semibold">Bạn chưa có đơn hàng nào</p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.03 }}
          onClick={() => router.push("/")}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors"
        >
          Mua sắm ngay
        </motion.button>
      </div>
    );
  }

  /* ── Main ── */
  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16">
      <div className="max-w-7xl mx-auto px-4 pt-20 sm:pt-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-6"
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-1 h-6 sm:h-7 bg-blue-500 rounded-full" />
            <h1 className="text-xl sm:text-3xl font-bold">Đơn hàng của tôi</h1>
            <span className="text-xs text-gray-500">
              {orders.length} đơn
            </span>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.03 }}
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-xs sm:text-sm font-medium transition-colors"
          >
            <FaChevronRight size={10} className="rotate-180" />
            <span className="hidden xs:inline">Trang chủ</span>
            <span className="xs:hidden">Home</span>
          </motion.button>
        </motion.div>

        {/* ─── DESKTOP: Table (md+) ─── */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-4 text-left">Order ID</th>
                <th className="px-4 py-4 text-left">Ngày đặt</th>
                <th className="px-4 py-4 text-left">Sản phẩm</th>
                <th className="px-4 py-4 text-left">Vendor</th>
                <th className="px-4 py-4 text-left">Thanh toán</th>
                <th className="px-4 py-4 text-left">Trạng thái</th>
                <th className="px-4 py-4 text-right">Tổng tiền</th>
                <th className="px-4 py-4 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((order, i) => {
                const st = STATUS_CONFIG[order.orderStatus] ?? STATUS_CONFIG.pending;
                return (
                  <motion.tr
                    key={order._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-gray-900/40 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-4 font-mono text-xs text-blue-400 font-semibold whitespace-nowrap">
                      {shortId(order._id)}
                    </td>
                    <td className="px-4 py-4 text-gray-400 whitespace-nowrap text-xs">
                      {fmtDate(order.createdAt)}
                    </td>
                    <td className="px-4 py-4 max-w-[200px]">
                      <div className="space-y-1">
                        {order.products.slice(0, 2).map((p) => (
                          <p key={p.product._id} className="text-xs text-gray-300 truncate">
                            {p.product.title}{" "}
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
                    <td className="px-4 py-4 text-gray-300 text-xs whitespace-nowrap">
                      {order.productVendor?.shopName || order.productVendor?.name || "—"}
                    </td>
                    <td className="px-4 py-4">
                      <span className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/25 rounded-full px-2.5 py-1 w-fit">
                        <FaMoneyBillWave size={10} />
                        COD
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.color} ${st.bg} ${st.border}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-bold text-blue-400 whitespace-nowrap">
                      {fmt(order.totalAmount)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <motion.button
                          whileTap={{ scale: 0.93 }}
                          whileHover={{ scale: 1.05 }}
                          onClick={() => setDetailOrder(order)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/35 transition-colors whitespace-nowrap"
                        >
                          Chi tiết
                        </motion.button>
                        <motion.button
                          whileTap={{ scale: 0.93 }}
                          whileHover={{ scale: 1.05 }}
                          onClick={() => setTrackOrder(order)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/35 transition-colors whitespace-nowrap"
                        >
                          Theo dõi
                        </motion.button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ─── MOBILE: Cards (< md) ─── */}
        <div className="md:hidden space-y-3">
          {orders.map((order, i) => {
            const st = STATUS_CONFIG[order.orderStatus] ?? STATUS_CONFIG.pending;
            return (
              <motion.div
                key={order._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-gray-900/60 border border-white/10 rounded-2xl overflow-hidden"
              >
                {/* Card top: ID + Status */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 bg-white/5">
                  <span className="font-mono text-xs text-blue-400 font-bold">
                    {shortId(order._id)}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.color} ${st.bg} ${st.border}`}>
                    {st.label}
                  </span>
                </div>

                {/* Card body */}
                <div className="px-4 py-3 space-y-2.5">
                  {/* Date */}
                  <p className="text-[11px] text-gray-500">{fmtDate(order.createdAt)}</p>

                  {/* Products */}
                  <div className="space-y-1">
                    {order.products.slice(0, 2).map((p) => (
                      <div key={p.product._id} className="flex items-center gap-2">
                        {p.product.image1 && (
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-800 border border-white/10 shrink-0">
                            <img src={p.product.image1} alt={p.product.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <p className="text-xs text-gray-300 truncate flex-1">
                          {p.product.title}
                          <span className="text-gray-500 ml-1">×{p.quantity}</span>
                        </p>
                      </div>
                    ))}
                    {order.products.length > 2 && (
                      <p className="text-[10px] text-gray-600 pl-10">
                        +{order.products.length - 2} sản phẩm khác
                      </p>
                    )}
                  </div>

                  {/* Vendor + Payment row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {order.productVendor?.shopName || order.productVendor?.name || "—"}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/25 rounded-full px-2 py-0.5">
                      <FaMoneyBillWave size={9} />
                      COD
                    </span>
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/8">
                    <span className="text-xs text-gray-500">Tổng tiền</span>
                    <span className="font-bold text-blue-400 text-sm">{fmt(order.totalAmount)}</span>
                  </div>
                </div>

                {/* Card footer: actions */}
                <div className="grid grid-cols-2 divide-x divide-white/8 border-t border-white/8">
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setDetailOrder(order)}
                    className="py-3 text-xs font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                  >
                    Chi tiết
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setTrackOrder(order)}
                    className="py-3 text-xs font-medium text-purple-400 hover:bg-purple-500/10 transition-colors"
                  >
                    Theo dõi
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ══════════ MODAL: Check Details ══════════ */}
      <AnimatePresence>
        {detailOrder && (
          <DetailModal order={detailOrder} onClose={() => setDetailOrder(null)} />
        )}
      </AnimatePresence>

      {/* ══════════ MODAL: Track Order ══════════ */}
      <AnimatePresence>
        {trackOrder && (
          <TrackModal order={trackOrder} onClose={() => setTrackOrder(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL — Check Details
════════════════════════════════════════════════════════════ */
function DetailModal({
  order,
  onClose,
}: {
  order: IOrder;
  onClose: () => void;
}) {
  const st = STATUS_CONFIG[order.orderStatus] ?? STATUS_CONFIG.pending;
  const isDelivered = order.orderStatus === "delivered";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div>
            <h2 className="font-bold text-base">Chi tiết đơn hàng</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono text-blue-400">{shortId(order._id)}</span>
              {" · "}
              {new Date(order.createdAt).toLocaleDateString("vi-VN")}
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${st.color} ${st.bg} ${st.border}`}
          >
            {st.label}
          </span>
        </div>

        {/* Body — scrollable */}
        <div className="max-h-[65vh] overflow-y-auto px-6 py-5 space-y-5">
          {/* Product list */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Sản phẩm đặt hàng
            </h3>
            <div className="space-y-3">
              {order.products.map((p) => (
                <div key={p.product._id} className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-800 border border-white/10 shrink-0">
                    <img
                      src={p.product.image1}
                      alt={p.product.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white line-clamp-2 leading-snug">
                      {p.product.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Số lượng:{" "}
                      <span className="text-gray-300 font-medium">{p.quantity}</span>
                    </p>
                  </div>
                  <p className="text-sm font-bold text-blue-400 shrink-0">
                    {fmt(p.price * p.quantity)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10" />

          {/* Invoice */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Hóa đơn
            </h3>
            <div className="bg-white/5 rounded-xl p-4 space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Tiền hàng</span>
                <span>{fmt(order.productsTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  <FaTruck size={11} className="text-gray-500" />
                  Phí giao hàng
                </span>
                {order.deliveryCharge === 0 ? (
                  <span className="text-green-400 font-medium">Miễn phí</span>
                ) : (
                  <span>{fmt(order.deliveryCharge)}</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Phí dịch vụ</span>
                <span>{fmt(order.serviceCharge)}</span>
              </div>
              <div className="h-px bg-white/10 my-1" />
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">Tổng thanh toán</span>
                <span className="text-lg font-black text-blue-400">
                  {fmt(order.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 flex items-center justify-between gap-3">
          {/* Left: action button */}
          {isDelivered ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600/20 border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-600/35 transition-colors"
            >
              <FaUndoAlt size={12} />
              Trả hàng
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              disabled={order.orderStatus === "cancelled"}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors
                ${
                  order.orderStatus === "cancelled"
                    ? "bg-gray-800 border border-white/10 text-gray-600 cursor-not-allowed"
                    : "bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/35"
                }`}
            >
              <FaTimesCircle size={12} />
              {order.orderStatus === "cancelled" ? "Đã hủy" : "Hủy đơn"}
            </motion.button>
          )}

          {/* Right: close */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.03 }}
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-medium hover:bg-white/15 transition-colors"
          >
            <FaTimes size={12} />
            Đóng
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════
   MODAL — Track Order
════════════════════════════════════════════════════════════ */
function TrackModal({
  order,
  onClose,
}: {
  order: IOrder;
  onClose: () => void;
}) {
  const currentStep = getStepIndex(order.orderStatus);
  const isCancelledOrReturned =
    order.orderStatus === "cancelled" || order.orderStatus === "returned";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-2">
            <FaShippingFast size={18} className="text-purple-400" />
            <h2 className="font-bold text-base">Theo dõi đơn hàng</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <FaTimes size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* ── Delivery info ── */}
          <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Thông tin giao hàng
            </h3>

            <div className="flex items-start gap-3">
              <FaUser size={13} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Người nhận
                </p>
                <p className="text-sm font-semibold text-white">
                  {order.address.name}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FaPhoneAlt size={13} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Số điện thoại
                </p>
                <p className="text-sm font-semibold text-white">
                  {order.address.phone}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FaMapMarkerAlt size={13} className="text-blue-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  Địa chỉ
                </p>
                <p className="text-sm text-white">{order.address.address}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {order.address.city}
                  {order.address.pincode ? ` · ${order.address.pincode}` : ""}
                </p>
              </div>
            </div>
          </div>

          {/* ── Status timeline ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Tiến trình đơn hàng
            </h3>

            {isCancelledOrReturned ? (
              /* Cancelled / Returned state */
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/25">
                <FaTimesCircle size={20} className="text-red-400 shrink-0" />
                <div>
                  <p className="font-semibold text-red-400 text-sm">
                    {order.orderStatus === "cancelled"
                      ? "Đơn hàng đã bị hủy"
                      : "Đơn hàng đã được trả lại"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
              </div>
            ) : (
              /* Normal timeline */
              <div className="relative">
                {TRACKING_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStep;
                  const isActive = idx === currentStep;
                  const isLast = idx === TRACKING_STEPS.length - 1;

                  return (
                    <div key={step.key} className="flex gap-4">
                      {/* Left: icon + connector */}
                      <div className="flex flex-col items-center">
                        <motion.div
                          initial={false}
                          animate={{
                            scale: isActive ? [1, 1.15, 1] : 1,
                          }}
                          transition={{
                            repeat: isActive ? Infinity : 0,
                            duration: 1.8,
                          }}
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-500
                            ${
                              isDone
                                ? "bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/30"
                                : "bg-gray-800 border-white/15"
                            }`}
                        >
                          <step.Icon
                            size={16}
                            className={isDone ? "text-white" : "text-gray-600"}
                          />
                        </motion.div>

                        {!isLast && (
                          <div className="w-0.5 h-10 mt-1 relative overflow-hidden bg-white/10 rounded-full">
                            {isDone && !isActive && (
                              <motion.div
                                initial={{ height: "0%" }}
                                animate={{ height: "100%" }}
                                transition={{ duration: 0.5, delay: idx * 0.1 }}
                                className="absolute top-0 left-0 w-full bg-blue-500"
                              />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right: label */}
                      <div className="pb-8 flex-1 flex items-start pt-1.5">
                        <div>
                          <p
                            className={`text-sm font-semibold transition-colors ${
                              isDone ? "text-white" : "text-gray-600"
                            }`}
                          >
                            {step.label}
                          </p>
                          {isActive && (
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-xs text-blue-400 mt-0.5"
                            >
                              Trạng thái hiện tại
                            </motion.p>
                          )}
                        </div>
                        {isActive && (
                          <motion.div
                            animate={{ x: [0, 4, 0] }}
                            transition={{ repeat: Infinity, duration: 1.2 }}
                            className="ml-auto"
                          >
                            <FaChevronRight size={12} className="text-blue-400" />
                          </motion.div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/5">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.02 }}
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/10 border border-white/15 text-white text-sm font-medium hover:bg-white/15 transition-colors"
          >
            Đóng
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
