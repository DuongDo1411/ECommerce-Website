"use client";
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import {
  FaStore,
  FaSearch,
  FaTimes,
  FaCheckCircle,
  FaClock,
  FaBox,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaFileInvoice,
  FaSortAmountDown,
} from "react-icons/fa";
import { MdVerified, MdStorefront } from "react-icons/md";

interface Vendor {
  _id: string;
  name: string;
  email: string;
  phone: string;
  image: string | null;
  shopName: string;
  shopAddress: string;
  taxNumber: string;
  isApproved: boolean;
  verificationStatus: "pending" | "approved" | "rejected";
  rejectedReason: string;
  requestedAt: string | null;
  approvedAt: string | null;
  createdAt: string | null;
  totalProducts: number;
  approvedProducts: number;
}

type StatusFilter = "all" | "approved" | "pending";
type SortKey = "newest" | "oldest" | "name";

const STATUS_CONFIG = {
  approved: {
    label: "Đã duyệt",
    icon: <FaCheckCircle size={12} />,
    cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  pending: {
    label: "Chờ duyệt",
    icon: <FaClock size={12} />,
    cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    dot: "bg-yellow-400",
  },
  rejected: {
    label: "Rejected",
    icon: <FaTimes size={12} />,
    cls: "bg-red-500/15 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function VendorDetails() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/vendor/AllVendor")
      .then((r) => r.json())
      .then((d) => setVendors(d.vendors ?? []))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => ({
    total: vendors.length,
    approved: vendors.filter((v) => v.verificationStatus === "approved").length,
    pending: vendors.filter((v) => v.verificationStatus === "pending").length,
  }), [vendors]);

  const filtered = useMemo(() => {
    let result = [...vendors];

    if (statusFilter !== "all") {
      result = result.filter((v) => v.verificationStatus === statusFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q) ||
          v.shopName.toLowerCase().includes(q),
      );
    }

    if (sort === "newest") result.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
    else if (sort === "oldest") result.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
    else if (sort === "name") result.sort((a, b) => (a.shopName || a.name).localeCompare(b.shopName || b.name));

    return result;
  }, [vendors, search, statusFilter, sort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <MdStorefront size={28} className="text-blue-400" />
          Vendor Details
        </h1>
        <p className="text-gray-500 text-sm mt-1">Danh sách tất cả vendor đã đăng ký trên hệ thống</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Tổng vendor", value: stats.total, color: "blue", icon: <FaStore size={18} /> },
          { label: "Đã duyệt", value: stats.approved, color: "emerald", icon: <FaCheckCircle size={18} /> },
          { label: "Chờ duyệt", value: stats.pending, color: "yellow", icon: <FaClock size={18} /> },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
              ${s.color === "blue" ? "bg-blue-500/15 text-blue-400" :
                s.color === "emerald" ? "bg-emerald-500/15 text-emerald-400" :
                s.color === "yellow" ? "bg-yellow-500/15 text-yellow-400" :
                "bg-red-500/15 text-red-400"}`}
            >
              {s.icon}
            </div>
            <div>
              <p className="text-xl font-black text-white">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex-1 min-w-0">
          <FaSearch size={13} className="text-gray-500 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, email, tên shop..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none min-w-0"
          />
          {search && (
            <button onClick={() => setSearch("")}>
              <FaTimes size={12} className="text-gray-500 hover:text-white transition-colors" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 shrink-0">
          <FaSortAmountDown size={13} className="text-gray-500" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-transparent text-sm text-gray-300 focus:outline-none cursor-pointer"
          >
            <option value="newest" className="bg-gray-900">Mới nhất</option>
            <option value="oldest" className="bg-gray-900">Cũ nhất</option>
            <option value="name" className="bg-gray-900">Tên A-Z</option>
          </select>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {(["all", "approved", "pending"] as StatusFilter[]).map((s) => {
          const count = s === "all" ? stats.total : stats[s];
          const isActive = statusFilter === s;
          return (
            <motion.button
              key={s}
              whileTap={{ scale: 0.96 }}
              onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isActive
                  ? s === "all"
                    ? "bg-blue-600 border-blue-500 text-white"
                    : s === "approved"
                    ? "bg-emerald-600 border-emerald-500 text-white"
                    : s === "pending"
                    ? "bg-yellow-600 border-yellow-500 text-white"
                    : "bg-red-600 border-red-500 text-white"
                  : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20 hover:text-white"
              }`}
            >
              {s === "all" ? "Tất cả" : STATUS_CONFIG[s].label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isActive ? "bg-white/20" : "bg-white/10"}`}>
                {count}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Result count */}
      <p className="text-xs text-gray-500">
        Hiển thị <span className="text-white font-semibold">{filtered.length}</span> / {vendors.length} vendor
      </p>

      {/* Vendor list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <FaStore size={40} className="mb-3 opacity-30" />
          <p className="text-sm">Không tìm thấy vendor phù hợp</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((vendor, i) => {
            const status = STATUS_CONFIG[vendor.verificationStatus];
            const isOpen = expanded === vendor._id;

            return (
              <motion.div
                key={vendor._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-colors"
              >
                {/* Main row */}
                <button
                  className="w-full text-left p-4 flex items-center gap-4"
                  onClick={() => setExpanded(isOpen ? null : vendor._id)}
                >
                  {/* Avatar */}
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center shrink-0 border border-white/10">
                    {vendor.image ? (
                      <Image
                        src={vendor.image}
                        alt={vendor.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <FaStore size={20} className="text-blue-400 opacity-60" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <p className="text-white font-semibold text-sm truncate">
                        {vendor.shopName || vendor.name}
                      </p>
                      {vendor.isApproved && (
                        <MdVerified size={14} className="text-blue-400 shrink-0" />
                      )}
                      <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>
                        {status.icon}
                        {status.label}
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs truncate">{vendor.email}</p>
                  </div>

                  {/* Right side stats */}
                  <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400">
                      <span className="text-white font-semibold">{vendor.approvedProducts}</span>/{vendor.totalProducts} sản phẩm
                    </span>
                    <span className="text-[10px] text-gray-600">{fmtDate(vendor.createdAt)}</span>
                  </div>

                  {/* Chevron */}
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-gray-500 text-xs ml-1 shrink-0"
                  >
                    ▼
                  </motion.span>
                </button>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/10 px-4 py-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Owner */}
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Chủ shop</p>
                          <p className="text-white text-sm font-semibold">{vendor.name}</p>
                        </div>

                        {/* Email */}
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold flex items-center gap-1"><FaEnvelope size={9} /> Email</p>
                          <p className="text-gray-300 text-sm break-all">{vendor.email || "—"}</p>
                        </div>

                        {/* Phone */}
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold flex items-center gap-1"><FaPhone size={9} /> Số điện thoại</p>
                          <p className="text-gray-300 text-sm">{vendor.phone || "—"}</p>
                        </div>

                        {/* Tax */}
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold flex items-center gap-1"><FaFileInvoice size={9} /> Mã số thuế</p>
                          <p className="text-gray-300 text-sm font-mono">{vendor.taxNumber || "—"}</p>
                        </div>

                        {/* Address */}
                        <div className="space-y-1 sm:col-span-2">
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold flex items-center gap-1"><FaMapMarkerAlt size={9} /> Địa chỉ kho</p>
                          <p className="text-gray-300 text-sm leading-relaxed">{vendor.shopAddress || "—"}</p>
                        </div>

                        {/* Products */}
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold flex items-center gap-1"><FaBox size={9} /> Sản phẩm</p>
                          <p className="text-gray-300 text-sm">
                            <span className="text-emerald-400 font-semibold">{vendor.approvedProducts}</span> đang bán
                            {" / "}
                            <span className="text-white font-semibold">{vendor.totalProducts}</span> tổng
                          </p>
                        </div>

                        {/* Dates */}
                        <div className="space-y-1">
                          <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Ngày đăng ký</p>
                          <p className="text-gray-300 text-sm">{fmtDate(vendor.createdAt)}</p>
                        </div>

                        {vendor.approvedAt && (
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Ngày được duyệt</p>
                            <p className="text-emerald-400 text-sm">{fmtDate(vendor.approvedAt)}</p>
                          </div>
                        )}

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
