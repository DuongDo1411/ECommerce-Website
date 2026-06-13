"use client";

import axios from "axios";
import { motion } from "motion/react";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { FaBoxOpen, FaDollarSign, FaStore } from "react-icons/fa6";
import { MdPendingActions } from "react-icons/md";

interface VendorItem {
  _id: string;
  name: string;
  email: string;
  phone: string;
  image: string | null;
  shopName: string;
  approvedAt: string | null;
  activeProducts: number;
  monthlyRevenue: number;
  deliveredOrders: number;
}

interface DashboardData {
  activeVendors: number;
  pendingVendors: number;
  pendingProducts: number;
  platformMonthlyRevenue: number;
  topVendor: VendorItem | null;
  vendors: VendorItem[];
}

function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const res = await axios.get<DashboardData>("/api/admin/dashboard");
        if (!ignore) setData(res.data);
      } catch (error) {
        console.log(error);
        if (!ignore) setData(null);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchDashboard();

    return () => {
      ignore = true;
    };
  }, []);

  if (loading) return <DashboardSkeleton />;

  if (!data) {
    return (
      <div className="flex min-h-96 items-center justify-center text-gray-400">
        Unable to load admin dashboard data.
      </div>
    );
  }

  const topVendor =
    data.topVendor && data.topVendor.monthlyRevenue > 0
      ? data.topVendor
      : null;

  return (
    <div className="w-full px-3 sm:px-6 lg:px-10 py-6 text-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="h-1 w-12 bg-linear-to-r from-blue-500 to-blue-600 rounded-full" />
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
            Admin Overview
          </h1>
        </div>
        <p className="text-gray-400 text-sm ml-4">
          Platform insights and vendor performance
        </p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          icon={<FaStore />}
          label="Active Vendors"
          value={data.activeVendors.toLocaleString("vi-VN")}
          subtitle="Vendors đang hoạt động"
          tone="blue"
        />
        <StatsCard
          icon={<MdPendingActions />}
          label="Pending Vendors"
          value={data.pendingVendors.toLocaleString("vi-VN")}
          subtitle="Chờ phê duyệt"
          tone="amber"
        />
        <StatsCard
          icon={<FaBoxOpen />}
          label="Pending Products"
          value={data.pendingProducts.toLocaleString("vi-VN")}
          subtitle="Sản phẩm chờ duyệt"
          tone="orange"
        />
        <StatsCard
          icon={<FaDollarSign />}
          label="Platform Revenue"
          value={formatCurrency(data.platformMonthlyRevenue)}
          subtitle="Doanh thu tháng này"
          tone="green"
        />
      </div>

      {data.pendingVendors > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-6 flex flex-col gap-4 rounded-xl border border-amber-400/25 bg-amber-500/8 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <MdPendingActions className="text-amber-300" size={22} />
            <div>
              <p className="font-semibold text-amber-200">
                {data.pendingVendors} vendor đang chờ phê duyệt
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Xem lại và phê duyệt tại mục Vendor Approval
              </p>
            </div>
          </div>
          <span className="w-fit rounded-full border border-amber-400/30 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300">
            {data.pendingVendors} chờ duyệt
          </span>
        </motion.div>
      )}

      {topVendor && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-6 rounded-xl border border-yellow-400/20 bg-linear-to-r from-yellow-500/8 to-transparent p-5"
        >
          <p className="text-xs text-yellow-400 font-semibold uppercase tracking-widest mb-3">
            🏆 Top Vendor tháng này
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <VendorAvatar vendor={topVendor} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold text-white truncate">
                {topVendor.name || "Unnamed Vendor"}
              </p>
              <p className="text-sm text-gray-400 truncate">
                {topVendor.shopName || "No shop name"}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-2xl font-bold text-green-400">
                {formatCurrency(topVendor.monthlyRevenue)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {topVendor.deliveredOrders} đơn thành công
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <section className="rounded-xl border border-blue-500/20 bg-white/5 shadow-lg shadow-blue-500/10">
        <div className="flex items-center justify-between gap-3 border-b border-blue-500/20 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              Danh sách Vendors đã duyệt
            </h2>
            <p className="text-sm text-gray-500">
              Monthly revenue and successful orders by approved vendor
            </p>
          </div>
          <span className="rounded-full border border-blue-400/30 bg-blue-500/15 px-3 py-1 text-xs font-semibold text-blue-300">
            {data.vendors.length} vendors
          </span>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-blue-600/10 text-xs uppercase tracking-widest text-blue-300">
              <tr>
                <th className="p-4 font-semibold">Vendor</th>
                <th className="p-4 font-semibold">Liên hệ</th>
                <th className="p-4 font-semibold">Doanh thu tháng này</th>
                <th className="p-4 text-center font-semibold">
                  Đơn thành công
                </th>
                <th className="p-4 text-center font-semibold">
                  Sản phẩm active
                </th>
                <th className="p-4 font-semibold">Ngày duyệt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-500/10">
              {data.vendors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    No approved vendors yet.
                  </td>
                </tr>
              ) : (
                data.vendors.map((vendor) => (
                  <tr key={vendor._id} className="hover:bg-white/4">
                    <td className="p-4">
                      <VendorIdentity vendor={vendor} />
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-gray-200">
                        {vendor.email || "N/A"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {vendor.phone || "N/A"}
                      </p>
                    </td>
                    <td className="p-4">
                      <span
                        className={`font-bold ${
                          vendor.monthlyRevenue > 0
                            ? "text-green-400"
                            : "text-gray-500"
                        }`}
                      >
                        {formatCurrency(vendor.monthlyRevenue)}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex min-w-10 justify-center rounded-full border border-blue-400/30 bg-blue-500/15 px-3 py-1 text-sm font-bold text-blue-300">
                        {vendor.deliveredOrders}
                      </span>
                    </td>
                    <td className="p-4 text-center text-gray-200">
                      {vendor.activeProducts}
                    </td>
                    <td className="p-4 text-sm text-gray-400">
                      {formatDate(vendor.approvedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden divide-y divide-blue-500/10">
          {data.vendors.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              No approved vendors yet.
            </div>
          ) : (
            data.vendors.map((vendor) => (
              <div key={vendor._id} className="space-y-4 p-5">
                <VendorIdentity vendor={vendor} />
                <div className="grid grid-cols-3 gap-3 text-center">
                  <MobileMetric
                    label="Revenue"
                    value={formatCurrency(vendor.monthlyRevenue)}
                    active={vendor.monthlyRevenue > 0}
                  />
                  <MobileMetric
                    label="Orders"
                    value={String(vendor.deliveredOrders)}
                    active
                  />
                  <MobileMetric
                    label="Products"
                    value={String(vendor.activeProducts)}
                    active
                  />
                </div>
                <div className="rounded-lg border border-white/10 bg-black/15 p-3 text-xs text-gray-400">
                  <p>{vendor.email || "N/A"}</p>
                  <p className="mt-1">{vendor.phone || "N/A"}</p>
                  <p className="mt-1">Approved: {formatDate(vendor.approvedAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

const StatsCard = ({
  icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  tone: "blue" | "amber" | "orange" | "green";
}) => {
  const toneClass = {
    blue: "border-blue-400/25 bg-blue-500/8 text-blue-300",
    amber: "border-amber-400/25 bg-amber-500/8 text-amber-300",
    orange: "border-orange-400/25 bg-orange-500/8 text-orange-300",
    green: "border-green-400/25 bg-green-500/8 text-green-300",
  }[tone];

  return (
    <div className={`rounded-xl border p-5 shadow-lg shadow-black/10 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-gray-400">
            {label}
          </p>
          <p className="mt-2 text-2xl lg:text-3xl font-bold text-white break-words">
            {value}
          </p>
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-black/20 text-2xl">
          {icon}
        </div>
      </div>
    </div>
  );
};

const VendorIdentity = ({ vendor }: { vendor: VendorItem }) => (
  <div className="flex items-center gap-3 min-w-0">
    <VendorAvatar vendor={vendor} />
    <div className="min-w-0">
      <p className="font-semibold text-white truncate">
        {vendor.name || "Unnamed Vendor"}
      </p>
      <p className="text-xs text-gray-400 truncate">
        {vendor.shopName || "No shop name"}
      </p>
    </div>
  </div>
);

const VendorAvatar = ({
  vendor,
  size = "md",
}: {
  vendor: VendorItem;
  size?: "md" | "lg";
}) => {
  const dimension = size === "lg" ? "h-16 w-16" : "h-11 w-11";
  const textSize = size === "lg" ? "text-xl" : "text-sm";

  return (
    <div
      className={`${dimension} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-400/30 bg-linear-to-br from-blue-600/40 to-emerald-500/20 font-bold text-blue-100 ${textSize}`}
    >
      {vendor.image ? (
        <Image
          src={vendor.image}
          alt={vendor.name || "Vendor avatar"}
          fill
          sizes={size === "lg" ? "64px" : "44px"}
          className="object-cover"
        />
      ) : (
        getInitials(vendor.name || vendor.shopName)
      )}
    </div>
  );
};

const MobileMetric = ({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) => (
  <div className="rounded-lg border border-white/10 bg-black/15 p-3">
    <p className={`text-sm font-bold ${active ? "text-white" : "text-gray-500"}`}>
      {value}
    </p>
    <p className="mt-1 text-[11px] uppercase tracking-widest text-gray-500">
      {label}
    </p>
  </div>
);

const DashboardSkeleton = () => (
  <div className="w-full px-3 sm:px-6 lg:px-10 py-6 text-white">
    <div className="mb-8 space-y-3">
      <div className="h-9 w-72 animate-pulse rounded-lg bg-white/10" />
      <div className="h-4 w-80 animate-pulse rounded bg-white/8" />
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-xl border border-blue-500/10 bg-white/8"
        />
      ))}
    </div>
    <div className="mb-6 h-24 animate-pulse rounded-xl border border-amber-500/10 bg-white/8" />
    <div className="h-96 animate-pulse rounded-xl border border-blue-500/10 bg-white/8" />
  </div>
);

const getInitials = (name?: string) => {
  if (!name) return "V";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "V";

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(value);

const formatDate = (date?: string | null) => {
  if (!date) return "N/A";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "N/A";

  return parsed.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default Dashboard;
