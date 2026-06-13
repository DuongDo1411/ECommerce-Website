"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  FaShoppingCart,
  FaBoxOpen,
  FaClock,
  FaMoneyBillWave,
  FaExclamationTriangle,
  FaWallet,
  FaCreditCard,
} from "react-icons/fa";
import { MdStorefront } from "react-icons/md";
import Image from "next/image";

type Period = "day" | "month" | "year";

interface LowStockProduct {
  _id: string;
  title: string;
  stock: number;
  image1: string;
  lowSizes: { size: string; stock: number }[];
}

interface RecentOrder {
  _id: string;
  createdAt: string;
  totalAmount: number;
  orderStatus: string;
  buyer: { name: string; phone: string };
}

interface DashboardData {
  totalOrders: number;
  totalRevenue: number;
  monthlyRevenue: number;
  pendingOrders: number;
  activeProducts: number;
  totalProducts: number;
  pendingProducts: number;
  codOrders: number;
  vnpayOrders: number;
  lowStockProducts: LowStockProduct[];
  revenueChart: { label: string; revenue: number }[];
  ordersByStatus: Record<string, number>;
  recentOrders: RecentOrder[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  shipped: "#8b5cf6",
  delivered: "#10b981",
  returned: "#f97316",
  cancelled: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipped: "Đang giao",
  delivered: "Đã giao",
  returned: "Hoàn hàng",
  cancelled: "Đã huỷ",
};

const formatVND = (amount: number) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

function Dashboard({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("day");
  const [chartLoading, setChartLoading] = useState(false);

  const fetchDashboard = useCallback(async (p: Period, initial = false) => {
    if (initial) setLoading(true);
    else setChartLoading(true);
    try {
      const res = await fetch(`/api/vendor/dashboard?period=${p}`);
      const json = await res.json();
      setData(json);
    } finally {
      if (initial) setLoading(false);
      else setChartLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard("day", true);
  }, [fetchDashboard]);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    fetchDashboard(p);
  };

  const pieData = data
    ? Object.entries(data.ordersByStatus ?? {})
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          name: STATUS_LABELS[status] || status,
          value: count,
          color: STATUS_COLORS[status] || "#6b7280",
        }))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400">
        Không thể tải dữ liệu dashboard.
      </div>
    );
  }

  const kpiCards = [
    {
      label: "Tổng đơn hàng",
      value: data.totalOrders.toLocaleString("vi-VN"),
      icon: <FaShoppingCart size={22} />,
      color: "from-blue-600 to-blue-500",
      shadow: "shadow-blue-500/20",
    },
    {
      label: "Doanh thu tháng này",
      value: formatVND(data.monthlyRevenue),
      icon: <FaMoneyBillWave size={22} />,
      color: "from-emerald-600 to-emerald-500",
      shadow: "shadow-emerald-500/20",
    },
    {
      label: "Đơn chờ xác nhận",
      value: data.pendingOrders.toLocaleString("vi-VN"),
      icon: <FaClock size={22} />,
      color: "from-amber-600 to-amber-500",
      shadow: "shadow-amber-500/20",
    },
    {
      label: "Sản phẩm đang bán",
      value: `${data.activeProducts} / ${data.totalProducts}`,
      icon: <FaBoxOpen size={22} />,
      color: "from-purple-600 to-purple-500",
      shadow: "shadow-purple-500/20",
    },
    {
      label: "Đơn COD",
      value: data.codOrders.toLocaleString("vi-VN"),
      icon: <FaWallet size={22} />,
      color: "from-orange-600 to-orange-500",
      shadow: "shadow-orange-500/20",
    },
    {
      label: "Đơn VNPay",
      value: data.vnpayOrders.toLocaleString("vi-VN"),
      icon: <FaCreditCard size={22} />,
      color: "from-sky-600 to-sky-500",
      shadow: "shadow-sky-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <MdStorefront className="text-emerald-400" size={28} />
          Tổng quan cửa hàng
        </h2>
        <p className="text-gray-400 text-sm mt-1">Thống kê hoạt động kinh doanh của bạn</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`bg-gray-900/60 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-lg ${card.shadow} hover:border-white/20 transition-all`}
          >
            <div className={`inline-flex p-2.5 rounded-xl bg-linear-to-br ${card.color} text-white mb-3 shadow-lg`}>
              {card.icon}
            </div>
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">{card.label}</p>
            <p className="text-white font-bold text-base sm:text-lg xl:text-xl mt-1 break-words leading-tight">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-gray-900/60 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-white font-semibold">Biểu đồ doanh thu</h3>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {(["day", "month", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    period === p
                      ? "bg-emerald-600 text-white shadow"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {p === "day" ? "7 ngày" : p === "month" ? "12 tháng" : "5 năm"}
                </button>
              ))}
            </div>
          </div>
          <div className={`h-56 transition-opacity ${chartLoading ? "opacity-40" : "opacity-100"}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenueChart} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) =>
                    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)
                  }
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#fff", fontSize: 12 }}
                  formatter={(value) => [formatVND(Number(value)), "Doanh thu"]}
                />
                <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Donut */}
        <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">Trạng thái đơn hàng</h3>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-gray-500 text-sm">
              Chưa có đơn hàng nào
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8, color: "#fff", fontSize: 12 }}
                    formatter={(value, name) => [String(value) + " đơn", String(name)]}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Orders */}
        <div className="lg:col-span-2 bg-gray-900/60 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Đơn hàng gần đây</h3>
            {onNavigate && (
              <button
                onClick={() => onNavigate("orders")}
                className="text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors"
              >
                Xem tất cả →
              </button>
            )}
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Chưa có đơn hàng nào</p>
          ) : (
            <>
            <div className="sm:hidden space-y-2">
              {data.recentOrders.map((order) => (
                <div
                  key={order._id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-300">
                      #{String(order._id).slice(-6).toUpperCase()}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${STATUS_COLORS[order.orderStatus]}22`,
                        color: STATUS_COLORS[order.orderStatus] || "#9ca3af",
                      }}
                    >
                      {STATUS_LABELS[order.orderStatus] || order.orderStatus}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span className="max-w-[55%] truncate text-sm text-gray-200">
                      {order.buyer?.name || "—"}
                    </span>
                    <span className="text-right text-sm font-medium text-emerald-400">
                      {formatVND(order.totalAmount)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {formatDate(order.createdAt)}
                  </p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-white/5">
                    <th className="pb-3 text-left font-medium">Mã đơn</th>
                    <th className="pb-3 text-left font-medium">Người mua</th>
                    <th className="pb-3 text-right font-medium">Tổng tiền</th>
                    <th className="pb-3 text-center font-medium">Trạng thái</th>
                    <th className="pb-3 text-right font-medium">Ngày</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.recentOrders.map((order) => (
                    <tr key={order._id} className="hover:bg-white/3 transition-colors">
                      <td className="py-3 text-gray-300 font-mono text-xs">
                        #{String(order._id).slice(-6).toUpperCase()}
                      </td>
                      <td className="py-3 text-gray-200 truncate max-w-[120px]">
                        {order.buyer?.name || "—"}
                      </td>
                      <td className="py-3 text-right text-emerald-400 font-medium">
                        {formatVND(order.totalAmount)}
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${STATUS_COLORS[order.orderStatus]}22`,
                            color: STATUS_COLORS[order.orderStatus] || "#9ca3af",
                          }}
                        >
                          {STATUS_LABELS[order.orderStatus] || order.orderStatus}
                        </span>
                      </td>
                      <td className="py-3 text-right text-gray-400 text-xs">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-gray-900/60 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <FaExclamationTriangle className="text-amber-400" size={16} />
            Cảnh báo
          </h3>

          {/* Pending products */}
          {data.pendingProducts > 0 && (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <FaBoxOpen className="text-blue-400 shrink-0" size={18} />
              <div>
                <p className="text-blue-300 text-sm font-medium">
                  {data.pendingProducts} sản phẩm chờ duyệt
                </p>
                <p className="text-blue-400/60 text-xs mt-0.5">Đang chờ admin xét duyệt</p>
              </div>
            </div>
          )}

          {/* Low stock */}
          {data.lowStockProducts.length > 0 ? (
            <div className="space-y-2">
              <p className="text-amber-400/80 text-xs font-medium uppercase tracking-wider">
                Sắp hết hàng (≤ 5)
              </p>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {data.lowStockProducts.map((p) => (
                  <div
                    key={String(p._id)}
                    className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2.5"
                  >
                    <div className="relative w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-gray-800">
                      <Image src={p.image1} alt={p.title} fill className="object-cover" sizes="36px" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium truncate">{p.title}</p>
                      {p.lowSizes.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.lowSizes.map((s) => (
                            <span
                              key={s.size}
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            >
                              {s.size}: còn {s.stock}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-amber-400 text-xs font-bold mt-0.5">
                          Còn {p.stock} sản phẩm
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm text-center py-4">
              Không có cảnh báo tồn kho
            </div>
          )}

          {data.pendingProducts === 0 && data.lowStockProducts.length === 0 && (
            <div className="text-gray-500 text-sm text-center py-2">
              Mọi thứ đang ổn ✓
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
