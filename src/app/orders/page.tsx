"use client";
import { motion, AnimatePresence } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCheckCircle,
  FaChevronRight,
  FaClipboardList,
  FaCreditCard,
  FaExclamationTriangle,
  FaSearch,
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
  size?: string;
}

interface IOrder {
  _id: string;
  products: OrderProduct[];
  productVendor: { shopName?: string; name?: string };
  productsTotal: number;
  deliveryCharge: number;
  serviceCharge: number;
  totalAmount: number;
  paymentMethod: "cod" | "vnpay";
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
    wardName?: string;
    districtName?: string;
    provinceName?: string;
  };
  ghn?: {
    orderCode?: string;
    status?: string;
    expectedDeliveryTime?: string;
    visibleToCustomer?: boolean;
    statusLog?: { status: string; time: string }[];
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
  { key: "pending", label: "Đang chờ xác nhận", Icon: MdPendingActions },
  { key: "confirmed", label: "Đã xác nhận & giao cho ĐVVC", Icon: FaTruck },
];

function getStepIndex(status: string) {
  if (status === "pending") return 0;
  if (["confirmed", "shipped", "delivered"].includes(status)) return 1;
  return 0;
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

interface VnpayResult {
  responseCode: string;
  transactionNo: string;
  txnRef: string;
  amount: string;
  bankCode: string;
  orderInfo: string;
  payDate: string;
}

function formatVnpayDate(raw: string): string {
  // raw: yyyyMMddHHmmss
  if (raw.length < 14) return raw;
  return `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`;
}

/* ══════════════════════════════════════════ */
function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<IOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState<IOrder | null>(null);
  const [trackOrder, setTrackOrder] = useState<IOrder | null>(null);
  const [vnpayResult, setVnpayResult] = useState<VnpayResult | null>(null);

  /* ── Filter states ── */
  const [searchText, setSearchText] = useState("");
  const [filterDate, setFilterDate] = useState<"all" | "today" | "week" | "month">("all");
  const [filterVendor, setFilterVendor] = useState("all");
  const [filterPayment, setFilterPayment] = useState<"all" | "cod" | "vnpay">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | IOrder["orderStatus"]>("all");

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

  // Parse VNPay return params from URL once on mount
  useEffect(() => {
    const responseCode = searchParams.get("vnp_ResponseCode");
    if (!responseCode) return;

    setVnpayResult({
      responseCode,
      transactionNo: searchParams.get("vnp_TransactionNo") ?? "",
      txnRef: searchParams.get("vnp_TxnRef") ?? "",
      amount: String(parseInt(searchParams.get("vnp_Amount") ?? "0") / 100),
      bankCode: searchParams.get("vnp_BankCode") ?? "",
      orderInfo: searchParams.get("vnp_OrderInfo") ?? "",
      payDate: searchParams.get("vnp_PayDate") ?? "",
    });

    // Clean params from URL without triggering navigation
    window.history.replaceState({}, "", window.location.pathname);

    if (responseCode !== "00") {
      // Payment failed/cancelled — cancel via txnRef from URL params
      const txnRef = searchParams.get("vnp_TxnRef");
      if (txnRef) {
        fetch("/api/orders/vnpay/cancel-failed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txnRef }),
        }).then(() => fetchOrders());
      }
    } else {
      fetchOrders();
    }
  }, [searchParams, fetchOrders]);

  /* ── Derived: unique vendor names ── */
  const vendorOptions = useMemo(() => {
    const names = new Set<string>();
    orders.forEach((o) => {
      const n = o.productVendor?.shopName || o.productVendor?.name;
      if (n) names.add(n);
    });
    return Array.from(names).sort();
  }, [orders]);

  /* ── Derived: filtered list ── */
  const filteredOrders = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return orders.filter((order) => {
      if (q) {
        const matchId = order._id.toLowerCase().includes(q);
        const matchProduct = order.products.some((p) =>
          p.product.title.toLowerCase().includes(q),
        );
        const matchVendor = (
          order.productVendor?.shopName ||
          order.productVendor?.name ||
          ""
        )
          .toLowerCase()
          .includes(q);
        if (!matchId && !matchProduct && !matchVendor) return false;
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
      if (
        filterVendor !== "all" &&
        (order.productVendor?.shopName || order.productVendor?.name) !== filterVendor
      )
        return false;
      if (filterPayment !== "all" && order.paymentMethod !== filterPayment)
        return false;
      if (filterStatus !== "all" && order.orderStatus !== filterStatus)
        return false;
      return true;
    });
  }, [orders, searchText, filterDate, filterVendor, filterPayment, filterStatus]);

  const activeFilterCount = [
    searchText !== "",
    filterDate !== "all",
    filterVendor !== "all",
    filterPayment !== "all",
    filterStatus !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchText("");
    setFilterDate("all");
    setFilterVendor("all");
    setFilterPayment("all");
    setFilterStatus("all");
  };

  /* ── Loading ── */
  if (loading && !vnpayResult) {
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
  if (orders.length === 0 && !vnpayResult) {
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
      {/* VNPay payment result banner */}
      <AnimatePresence>
        {vnpayResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            >
              {/* Status header */}
              <div className="flex items-center gap-3 mb-5">
                {vnpayResult.responseCode === "00" ? (
                  <FaCheckCircle size={28} className="text-green-400 shrink-0" />
                ) : (
                  <FaExclamationTriangle size={28} className="text-red-400 shrink-0" />
                )}
                <div>
                  <p className="font-bold text-base">
                    {vnpayResult.responseCode === "00"
                      ? "Thanh toán thành công"
                      : "Thanh toán thất bại"}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {vnpayResult.responseCode === "00"
                      ? "Đơn hàng của bạn đã được xác nhận thanh toán."
                      : vnpayResult.responseCode === "24"
                        ? "Giao dịch bị hủy bởi người dùng."
                        : vnpayResult.responseCode === "51"
                          ? "Tài khoản không đủ số dư."
                          : `Giao dịch thất bại (mã lỗi: ${vnpayResult.responseCode}).`}
                  </p>
                </div>
              </div>

              {/* Payment details */}
              <div className="space-y-2.5 bg-white/5 rounded-xl p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Mã giao dịch</span>
                  <span className="font-mono font-semibold">{vnpayResult.transactionNo || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Mã tham chiếu</span>
                  <span className="font-mono text-xs text-gray-300">{vnpayResult.txnRef || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Số tiền</span>
                  <span className="font-bold text-blue-400">
                    {parseInt(vnpayResult.amount).toLocaleString("vi-VN")}₫
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ngân hàng / Thẻ</span>
                  <span className="font-semibold">{vnpayResult.bankCode || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Nội dung</span>
                  <span className="text-gray-300 text-xs text-right max-w-[55%] break-words">{vnpayResult.orderInfo || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Thời gian</span>
                  <span className="text-gray-300">{formatVnpayDate(vnpayResult.payDate)}</span>
                </div>
              </div>

              <button
                onClick={() => setVnpayResult(null)}
                className="mt-5 w-full py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 transition-colors text-white"
              >
                Xem đơn hàng
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              {filteredOrders.length !== orders.length
                ? `${filteredOrders.length} / ${orders.length} đơn`
                : `${orders.length} đơn`}
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

        {/* ─── Search + Filters ─── */}
        <div className="mb-5 space-y-3">
          {/* Search input */}
          <div className="relative">
            <FaSearch
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
              size={13}
            />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Tìm theo mã đơn, tên sản phẩm, vendor..."
              className="w-full pl-9 pr-9 py-2.5 bg-gray-900/60 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-colors"
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
                  ? "border-blue-500/60 text-blue-300"
                  : "border-white/10 text-gray-400 hover:border-white/20"
              }`}
            >
              <option value="all">Tất cả ngày</option>
              <option value="today">Hôm nay</option>
              <option value="week">7 ngày qua</option>
              <option value="month">30 ngày qua</option>
            </select>

            {/* Vendor */}
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className={`bg-gray-900/60 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                filterVendor !== "all"
                  ? "border-blue-500/60 text-blue-300"
                  : "border-white/10 text-gray-400 hover:border-white/20"
              }`}
            >
              <option value="all">Tất cả Vendor</option>
              {vendorOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            {/* Payment method */}
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value as typeof filterPayment)}
              className={`bg-gray-900/60 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                filterPayment !== "all"
                  ? "border-blue-500/60 text-blue-300"
                  : "border-white/10 text-gray-400 hover:border-white/20"
              }`}
            >
              <option value="all">Phương thức TT</option>
              <option value="cod">COD</option>
              <option value="vnpay">VNPay</option>
            </select>

            {/* Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className={`bg-gray-900/60 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                filterStatus !== "all"
                  ? "border-blue-500/60 text-blue-300"
                  : "border-white/10 text-gray-400 hover:border-white/20"
              }`}
            >
              <option value="all">Trạng thái</option>
              <option value="pending">Đang chờ</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="shipped">Đang vận chuyển</option>
              <option value="delivered">Đã giao</option>
              <option value="returned">Đã trả hàng</option>
              <option value="cancelled">Đã hủy</option>
            </select>

            {/* Clear filters button */}
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
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <p className="text-gray-500 text-sm">Không tìm thấy đơn hàng phù hợp</p>
                    {activeFilterCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="mt-2 text-xs text-blue-400 hover:underline"
                      >
                        Xóa bộ lọc
                      </button>
                    )}
                  </td>
                </tr>
              ) : filteredOrders.map((order, i) => {
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
                          <div key={`${p.product._id}-${p.size ?? ""}`} className="text-xs text-gray-300 truncate">
                            <span>{p.product.title}</span>{" "}
                            {p.size && (
                              <span className="text-blue-400/80">[{p.size}]</span>
                            )}{" "}
                            <span className="text-gray-500">×{p.quantity}</span>
                          </div>
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
                      {order.paymentMethod === "vnpay" ? (
                        <span className="flex items-center gap-1.5 text-xs text-purple-400 bg-purple-500/10 border border-purple-500/25 rounded-full px-2.5 py-1 w-fit">
                          <FaCreditCard size={10} />
                          VNPay
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/25 rounded-full px-2.5 py-1 w-fit">
                          <FaMoneyBillWave size={10} />
                          COD
                        </span>
                      )}
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
          {filteredOrders.length === 0 ? (
            <div className="text-center py-14 bg-gray-900/40 border border-white/10 rounded-2xl">
              <p className="text-gray-500 text-sm">Không tìm thấy đơn hàng phù hợp</p>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-xs text-blue-400 hover:underline"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : filteredOrders.map((order, i) => {
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
                      <div key={`${p.product._id}-${p.size ?? ""}`} className="flex items-center gap-2">
                        {p.product.image1 && (
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-800 border border-white/10 shrink-0">
                            <img src={p.product.image1} alt={p.product.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <p className="text-xs text-gray-300 truncate flex-1">
                          {p.product.title}
                          {p.size && (
                            <span className="text-blue-400/80 ml-1">[{p.size}]</span>
                          )}
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
                    {order.paymentMethod === "vnpay" ? (
                      <span className="flex items-center gap-1 text-[11px] text-purple-400 bg-purple-500/10 border border-purple-500/25 rounded-full px-2 py-0.5">
                        <FaCreditCard size={9} />
                        VNPay
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-blue-400 bg-blue-500/10 border border-blue-500/25 rounded-full px-2 py-0.5">
                        <FaMoneyBillWave size={9} />
                        COD
                      </span>
                    )}
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
          <DetailModal
            order={detailOrder}
            onClose={() => setDetailOrder(null)}
            onCancelled={(orderId) => {
              setOrders((prev) =>
                prev.map((o) =>
                  o._id === orderId ? { ...o, orderStatus: "cancelled" } : o,
                ),
              );
              setDetailOrder((prev) =>
                prev ? { ...prev, orderStatus: "cancelled" } : null,
              );
            }}
          />
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
export default function OrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-gray-400">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Đang tải đơn hàng...</p>
          </div>
        </div>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}

function DetailModal({
  order,
  onClose,
  onCancelled,
}: {
  order: IOrder;
  onClose: () => void;
  onCancelled: (orderId: string) => void;
}) {
  const st = STATUS_CONFIG[order.orderStatus] ?? STATUS_CONFIG.pending;
  const isDelivered = order.orderStatus === "delivered";
  const canUserCancel = order.orderStatus === "pending";

  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (!canUserCancel || cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/orders/${order._id}`, { method: "PATCH" });
      const data = await res.json();
      if (!res.ok) {
        setCancelError(data.message ?? "Hủy đơn thất bại");
      } else {
        onCancelled(order._id);
      }
    } catch {
      setCancelError("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setCancelling(false);
    }
  };

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
                <div key={`${p.product._id}-${p.size ?? ""}`} className="flex items-center gap-3">
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
                    {p.size && (
                      <span className="inline-block mt-0.5 bg-blue-500/15 text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-500/30">
                        Size: {p.size}
                      </span>
                    )}
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
        <div className="px-6 py-4 border-t border-white/10 bg-white/5 space-y-3">
          {/* Cancel error message */}
          {cancelError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-center">
              {cancelError}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
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
            ) : order.orderStatus === "cancelled" ? (
              /* Đã hủy — chỉ hiển thị trạng thái */
              <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 border border-white/10 text-gray-500 text-sm font-medium cursor-not-allowed">
                <FaTimesCircle size={12} />
                Đã hủy
              </span>
            ) : canUserCancel ? (
              /* pending — user có thể tự hủy */
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.03 }}
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600/20 border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-600/35 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? (
                  <>
                    <span className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                    Đang hủy...
                  </>
                ) : (
                  <>
                    <FaTimesCircle size={12} />
                    Hủy đơn
                  </>
                )}
              </motion.button>
            ) : (
              /* confirmed / shipped — chỉ vendor mới hủy được */
              <span className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 border border-white/10 text-gray-500 text-xs font-medium cursor-not-allowed">
                <FaTimesCircle size={11} />
                Liên hệ người bán để hủy
              </span>
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

  const ghnVisible = !!order.ghn?.orderCode && !!order.ghn?.visibleToCustomer;
  const [ghnStatusLabel, setGhnStatusLabel] = useState<string | null>(null);
  const [ghnLog, setGhnLog] = useState<
    { status: string; label: string; time: string }[]
  >([]);
  const [ghnLoading, setGhnLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshGhn = useCallback(async () => {
    if (!order.ghn?.orderCode) return;
    setGhnLoading(true);
    try {
      const res = await fetch(`/api/orders/${order._id}/track`);
      const data = await res.json();
      if (res.ok) {
        setGhnStatusLabel(data.statusLabel);
        setGhnLog(data.log ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setGhnLoading(false);
    }
  }, [order._id, order.ghn?.orderCode]);

  useEffect(() => {
    if (ghnVisible) refreshGhn();
  }, [ghnVisible, refreshGhn]);

  const copyCode = () => {
    if (!order.ghn?.orderCode) return;
    navigator.clipboard.writeText(order.ghn.orderCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
                {(order.address.wardName ||
                  order.address.districtName ||
                  order.address.provinceName) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[
                      order.address.wardName,
                      order.address.districtName,
                      order.address.provinceName,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── GHN shipment ── */}
          {order.ghn?.orderCode && order.ghn?.visibleToCustomer ? (
            <div className="bg-orange-500/5 rounded-xl p-4 space-y-3 border border-orange-500/20">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-orange-300 uppercase tracking-wider">
                  Vận đơn GHN
                </h3>
                <button
                  onClick={refreshGhn}
                  disabled={ghnLoading}
                  className="text-[11px] text-blue-400 hover:underline disabled:opacity-50"
                >
                  {ghnLoading ? "Đang cập nhật..." : "↻ Cập nhật"}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-white bg-white/5 px-2 py-1 rounded border border-white/10">
                  {order.ghn.orderCode}
                </span>
                <button
                  onClick={copyCode}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  {copied ? "Đã sao chép ✓" : "Sao chép"}
                </button>
              </div>

              {ghnStatusLabel && (
                <p className="text-sm text-white">
                  Trạng thái:{" "}
                  <span className="font-semibold text-orange-300">
                    {ghnStatusLabel}
                  </span>
                </p>
              )}

              {order.ghn.expectedDeliveryTime && (
                <p className="text-xs text-gray-400">
                  Dự kiến giao:{" "}
                  {new Date(
                    order.ghn.expectedDeliveryTime,
                  ).toLocaleDateString("vi-VN")}
                </p>
              )}

              {ghnLog.length > 0 && (
                <div className="space-y-1.5 border-t border-white/10 pt-3">
                  {ghnLog
                    .slice()
                    .reverse()
                    .map((l, i) => (
                      <div
                        key={i}
                        className="flex justify-between text-[11px] text-gray-400"
                      >
                        <span>{l.label}</span>
                        <span className="text-gray-600">
                          {new Date(l.time).toLocaleString("vi-VN")}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              <a
                href={`https://donhang.ghn.vn/?order_code=${order.ghn.orderCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs font-semibold text-blue-400 hover:underline pt-1"
              >
                Theo dõi trên GHN ↗
              </a>
            </div>
          ) : order.orderStatus === "confirmed" ? (
            <div className="bg-blue-500/5 rounded-xl p-4 border border-blue-500/20 text-sm text-blue-300">
              Người bán đã xác nhận và đang đóng gói đơn hàng của bạn.
            </div>
          ) : null}

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
                    Đơn hàng đã bị hủy
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
              </div>
            ) : (
              /* Normal timeline — 2 bước */
              <div className="relative">
                {TRACKING_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStep;
                  const isActive = idx === currentStep;
                  const isLast = idx === TRACKING_STEPS.length - 1;

                  /* Mã GHN hiển thị ngay trong bước 2 khi active */
                  const showGhnInline =
                    isActive &&
                    idx === 1 &&
                    !!order.ghn?.orderCode &&
                    !!order.ghn?.visibleToCustomer;

                  return (
                    <div key={step.key} className="flex gap-4">
                      {/* Left: icon + connector */}
                      <div className="flex flex-col items-center">
                        <motion.div
                          initial={false}
                          animate={{ scale: isActive ? [1, 1.15, 1] : 1 }}
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
                        <div className="flex-1">
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

                          {/* Mã vận đơn GHN ngay trong bước 2 */}
                          {showGhnInline && (
                            <motion.div
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="mt-2 flex flex-wrap items-center gap-2"
                            >
                              <span className="text-[11px] text-gray-400">
                                Mã vận đơn:
                              </span>
                              <span className="font-mono text-xs text-orange-300 bg-orange-500/10 border border-orange-500/25 px-2 py-0.5 rounded">
                                {order.ghn!.orderCode}
                              </span>
                              <a
                                href={`https://donhang.ghn.vn/?order_code=${order.ghn!.orderCode}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-blue-400 hover:underline"
                              >
                                Tra trên GHN ↗
                              </a>
                            </motion.div>
                          )}
                        </div>
                        {isActive && (
                          <motion.div
                            animate={{ x: [0, 4, 0] }}
                            transition={{ repeat: Infinity, duration: 1.2 }}
                            className="ml-2 mt-1"
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
