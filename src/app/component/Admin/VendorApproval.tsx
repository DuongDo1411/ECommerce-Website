"use client";

import type { IUser } from "@/model/user.model";
import type { AppDispatch, RootState } from "@/redux/store";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FaStore,
  FaPhone,
  FaMapLocationDot,
  FaFileInvoice,
  FaUserClock,
  FaCalendarDays,
  FaMagnifyingGlass,
} from "react-icons/fa6";
import { MdPendingActions } from "react-icons/md";
import { IoCheckmarkCircle, IoCloseCircle } from "react-icons/io5";
import axios from "axios";
import UseGetAllVendors from "@/hooks/UserGetAllVendors";
import { setAllVendorData } from "@/redux/vendorSlice";
import { ClipLoader } from "react-spinners";

type ModalStep = "detail" | "reject";

function VendorApproval() {
  const dispatch = useDispatch<AppDispatch>();
  UseGetAllVendors();
  const allVendorsData: IUser[] = useSelector(
    (state: RootState) => state.vendor.allVendorsData,
  );
  const pendingVendors = Array.isArray(allVendorsData)
    ? allVendorsData.filter((v) => v.verificationStatus == "pending")
    : [];

  const [selectedVendor, setSelectedVendor] = useState<IUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<ModalStep>("detail");
  const [search, setSearch] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");

  const searchTerm = search.trim().toLowerCase();
  const filteredVendors = pendingVendors.filter((vendor) => {
    if (!searchTerm) return true;
    return [vendor.name, vendor.shopName].some((value) =>
      value?.toLowerCase().includes(searchTerm),
    );
  });

  const openVendorModal = (vendor: IUser) => {
    setSelectedVendor(vendor);
    setStep("detail");
    setRejectedReason("");
  };

  const closeVendorModal = () => {
    if (loading) return;
    setSelectedVendor(null);
    setStep("detail");
    setRejectedReason("");
  };

  const openRejectReasonArea = () => {
    setStep("reject");
    setRejectedReason("");
  };

  const handleApproved = async () => {
    if (!selectedVendor) return;
    setLoading(true);
    try {
      await axios.post("/api/admin/update_vendor_status", {
        vendorId: selectedVendor?._id,
        status: "approved",
      });
      const updated = allVendorsData.filter(
        (v) => v._id !== selectedVendor?._id,
      );
      dispatch(setAllVendorData(updated));
      setSelectedVendor(null);
      setStep("detail");
      setRejectedReason("");
      setLoading(false);
      alert("Approval Success");
    } catch (error) {
      console.log(error);
      setLoading(false);
      alert("Approval Failed");
    }
  };

  const handleRejected = async () => {
    if (!selectedVendor) return;
    setLoading(true);
    try {
      await axios.post("/api/admin/update_vendor_status", {
        vendorId: selectedVendor?._id,
        status: "rejected",
        rejectedReason,
      });
      const updated = allVendorsData.filter(
        (v) => v._id !== selectedVendor?._id,
      );
      dispatch(setAllVendorData(updated));
      setSelectedVendor(null);
      setStep("detail");
      setRejectedReason("");
      setLoading(false);
      alert("Vendor Rejected");
    } catch (error) {
      console.log(error);
      setLoading(false);
      alert("Rejected Failed");
    }
  };

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
            Vendor Approval Requests
          </h1>
        </div>
        <p className="text-gray-400 text-sm ml-4">
          Manage and approve pending vendor registrations
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"
      >
        <StatsCard
          icon={<FaUserClock />}
          label="Pending Requests"
          value={pendingVendors.length}
          tone="amber"
        />
        <StatsCard
          icon={<IoCheckmarkCircle />}
          label="Approved Today"
          value="-"
          tone="green"
        />
        <StatsCard
          icon={<FaStore />}
          label="Total Vendors"
          value={Array.isArray(allVendorsData) ? allVendorsData.length : 0}
          tone="blue"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.45 }}
        className="mb-5"
      >
        <label className="relative block">
          <FaMagnifyingGlass
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300/70"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by vendor or shop name"
            className="w-full rounded-xl border border-blue-500/20 bg-white/5 px-11 py-3 text-sm text-gray-100 placeholder:text-gray-500 outline-none transition focus:border-blue-400/60 focus:bg-white/8 focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden md:block overflow-x-auto bg-linear-to-br from-white/5 to-white/2 rounded-xl border border-blue-500/20 shadow-lg shadow-blue-500/10"
      >
        <table className="w-full text-left">
          <thead className="bg-linear-to-r from-blue-600/20 to-transparent border-b border-blue-500/20">
            <tr>
              <th className="p-4 font-semibold text-blue-400">Vendor Name</th>
              <th className="p-4 font-semibold text-blue-400">Shop Name</th>
              <th className="p-4 font-semibold text-blue-400">Phone</th>
              <th className="p-4 font-semibold text-blue-400">
                Requested At
              </th>
              <th className="p-4 font-semibold text-blue-400">Status</th>
              <th className="p-4 text-center font-semibold text-blue-400">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredVendors.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-14">
                  <EmptyState hasSearch={Boolean(searchTerm)} />
                </td>
              </tr>
            ) : (
              filteredVendors.map((vendor, index) => (
                <motion.tr
                  key={String(vendor._id ?? index)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                  whileHover={{ backgroundColor: "rgba(59, 130, 246, 0.05)" }}
                  className="border-t border-blue-500/10 transition-all"
                >
                  <td className="p-4">
                    <VendorIdentity vendor={vendor} />
                  </td>
                  <td className="p-4 text-gray-300">
                    {vendor?.shopName || "N/A"}
                  </td>
                  <td className="p-4 text-gray-300">
                    {vendor?.phone || "N/A"}
                  </td>
                  <td className="p-4 text-gray-300">
                    {formatDate(vendor?.requestedAt)}
                  </td>
                  <td className="p-4">
                    <PendingBadge />
                  </td>
                  <td className="p-4 text-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => openVendorModal(vendor)}
                      className="px-5 py-2 rounded-lg bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-sm font-semibold shadow-lg shadow-blue-500/30 transition-all"
                    >
                      View Details
                    </motion.button>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="md:hidden flex flex-col gap-4"
      >
        {filteredVendors.length === 0 ? (
          <EmptyState hasSearch={Boolean(searchTerm)} />
        ) : (
          filteredVendors.map((vendor, index) => (
            <motion.div
              key={String(vendor._id ?? index)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="bg-linear-to-br from-white/8 to-white/4 border border-blue-500/20 rounded-xl p-5 space-y-4 shadow-lg shadow-black/20 hover:shadow-blue-500/10 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <VendorIdentity vendor={vendor} />
                <PendingBadge compact />
              </div>

              <div className="space-y-2.5 text-sm">
                <InfoRow
                  icon={<FaStore size={15} />}
                  label="Shop"
                  value={vendor?.shopName}
                />
                <InfoRow
                  icon={<FaPhone size={15} />}
                  label="Phone"
                  value={vendor?.phone}
                />
                <InfoRow
                  icon={<FaCalendarDays size={15} />}
                  label="Requested"
                  value={formatDate(vendor?.requestedAt)}
                />
              </div>

              <div className="flex justify-end pt-2 border-t border-blue-500/10">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="min-w-32 bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-sm font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-blue-500/30 transition-all"
                  onClick={() => openVendorModal(vendor)}
                >
                  View Details
                </motion.button>
              </div>
            </motion.div>
          ))
        )}
      </motion.div>

      <AnimatePresence>
        {selectedVendor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 px-4 py-8"
          >
            <motion.div
              initial={{ scale: 0.9, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 24 }}
              transition={{
                duration: 0.35,
                type: "spring",
                stiffness: 210,
                damping: 24,
              }}
              className="relative bg-linear-to-br from-gray-900 via-[#0a0f1e] to-gray-950 rounded-2xl w-full max-w-2xl border border-blue-500/25 shadow-2xl shadow-blue-950/60 overflow-hidden"
            >
              {loading && (
                <div className="absolute inset-0 z-30 bg-black/30 backdrop-blur-[1px] rounded-2xl" />
              )}

              <div className="h-1 w-full bg-linear-to-r from-amber-400 via-blue-500 to-green-400" />
              <div className="relative p-6 md:p-8">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-blue-500/20"
                >
                  <div className="flex items-center gap-4">
                    <VendorAvatar vendor={selectedVendor} size="lg" />
                    <div className="min-w-0">
                      <h3 className="text-xl md:text-2xl font-bold text-white truncate">
                        {selectedVendor?.name || "Unnamed Vendor"}
                      </h3>
                      <p className="text-gray-400 text-sm truncate">
                        {selectedVendor?.email || "No email"}
                      </p>
                    </div>
                  </div>
                  <PendingBadge />
                </motion.div>

                <AnimatePresence mode="wait">
                  {step === "detail" ? (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
                        <DetailItem
                          icon={<FaStore />}
                          label="Shop Name"
                          value={selectedVendor?.shopName}
                        />
                        <DetailItem
                          icon={<FaPhone />}
                          label="Phone"
                          value={selectedVendor?.phone}
                        />
                        <DetailItem
                          icon={<FaFileInvoice />}
                          label="Tax Number"
                          value={selectedVendor?.taxNumber}
                        />
                        <DetailItem
                          icon={<FaCalendarDays />}
                          label="Requested At"
                          value={formatDate(selectedVendor?.requestedAt)}
                        />
                        <DetailItem
                          icon={<FaMapLocationDot />}
                          label="Address"
                          value={selectedVendor?.shopAddress}
                          wide
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <motion.button
                          disabled={loading}
                          onClick={handleApproved}
                          whileHover={loading ? undefined : { scale: 1.04 }}
                          whileTap={loading ? undefined : { scale: 0.96 }}
                          className="flex-1 bg-linear-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <IoCheckmarkCircle size={18} />
                          {loading ? (
                            <ClipLoader size={18} color="white" />
                          ) : (
                            "Approve"
                          )}
                        </motion.button>
                        <motion.button
                          disabled={loading}
                          onClick={openRejectReasonArea}
                          whileHover={loading ? undefined : { scale: 1.04 }}
                          whileTap={loading ? undefined : { scale: 0.96 }}
                          className="flex-1 bg-linear-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <IoCloseCircle size={18} />
                          Reject
                        </motion.button>
                        <motion.button
                          disabled={loading}
                          whileHover={loading ? undefined : { scale: 1.04 }}
                          whileTap={loading ? undefined : { scale: 0.96 }}
                          onClick={closeVendorModal}
                          className="flex-1 bg-white/8 hover:bg-white/12 border border-white/10 py-2.5 rounded-xl text-sm font-bold text-gray-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Cancel
                        </motion.button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="reject"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="mb-6">
                        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/8 p-4">
                          <div className="flex items-center gap-2 text-red-300 font-semibold">
                            <IoCloseCircle size={18} />
                            Rejection Reason
                          </div>
                          <p className="text-sm text-gray-400 mt-1">
                            Provide a clear reason before rejecting this vendor
                            application.
                          </p>
                        </div>
                        <textarea
                          placeholder="Enter rejection reason"
                          className="w-full bg-white/5 border border-red-500/20 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30 rounded-xl p-3.5 text-sm text-gray-200 placeholder-gray-600 resize-none transition-all"
                          rows={5}
                          disabled={loading}
                          onChange={(e) => setRejectedReason(e.target.value)}
                          value={rejectedReason}
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3">
                        <motion.button
                          disabled={loading}
                          onClick={handleRejected}
                          whileHover={loading ? undefined : { scale: 1.04 }}
                          whileTap={loading ? undefined : { scale: 0.96 }}
                          className="flex-1 bg-linear-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <IoCloseCircle size={18} />
                          {loading ? (
                            <ClipLoader size={18} color="white" />
                          ) : (
                            "Confirm Reject"
                          )}
                        </motion.button>
                        <motion.button
                          disabled={loading}
                          whileHover={loading ? undefined : { scale: 1.04 }}
                          whileTap={loading ? undefined : { scale: 0.96 }}
                          onClick={() => setStep("detail")}
                          className="flex-1 bg-white/8 hover:bg-white/12 border border-white/10 py-2.5 rounded-xl text-sm font-bold text-gray-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Back
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const StatsCard = ({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "amber" | "green" | "blue";
}) => {
  const toneClass = {
    amber: "border-amber-400/25 bg-amber-500/8 text-amber-300",
    green: "border-green-400/25 bg-green-500/8 text-green-300",
    blue: "border-blue-400/25 bg-blue-500/8 text-blue-300",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 shadow-lg shadow-black/10 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-black/20 text-xl">
          {icon}
        </div>
      </div>
    </div>
  );
};

const VendorIdentity = ({ vendor }: { vendor: IUser }) => (
  <div className="flex items-center gap-3 min-w-0">
    <VendorAvatar vendor={vendor} />
    <div className="min-w-0">
      <p className="font-semibold text-white truncate">
        {vendor?.name || "Unnamed Vendor"}
      </p>
      <p className="text-xs text-gray-400 truncate">
        {vendor?.email || "No email"}
      </p>
    </div>
  </div>
);

const VendorAvatar = ({
  vendor,
  size = "md",
}: {
  vendor: IUser;
  size?: "md" | "lg";
}) => {
  const dimension = size === "lg" ? "h-16 w-16" : "h-11 w-11";
  const textSize = size === "lg" ? "text-xl" : "text-sm";

  return (
    <div
      className={`${dimension} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-blue-400/30 bg-linear-to-br from-blue-600/40 to-emerald-500/20 font-bold text-blue-100 ${textSize}`}
    >
      {vendor?.image ? (
        <Image
          src={vendor.image}
          alt={vendor?.name || "Vendor avatar"}
          fill
          sizes={size === "lg" ? "64px" : "44px"}
          className="object-cover"
        />
      ) : (
        getInitials(vendor?.name || vendor?.shopName)
      )}
    </div>
  );
};

const PendingBadge = ({ compact = false }: { compact?: boolean }) => (
  <motion.span
    whileHover={{ scale: 1.04 }}
    className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/15 font-semibold text-amber-300 ${
      compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
    }`}
  >
    <MdPendingActions size={compact ? 13 : 15} />
    Pending
  </motion.span>
);

const EmptyState = ({ hasSearch }: { hasSearch: boolean }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
    className="rounded-xl border border-blue-500/15 bg-white/4 px-6 py-12 text-center"
  >
    <motion.div
      initial={{ scale: 0.92, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.45 }}
      className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-3xl text-amber-300"
    >
      <FaUserClock />
    </motion.div>
    <h3 className="text-lg font-bold text-white">
      {hasSearch ? "No Matching Requests" : "No Pending Requests"}
    </h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
      {hasSearch
        ? "No pending vendor applications match your current search."
        : "All vendor applications have been reviewed. New requests will appear here."}
    </p>
  </motion.div>
);

const InfoRow = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) => (
  <div className="flex items-center gap-2.5 text-gray-300">
    <span className="text-blue-400">{icon}</span>
    <span className="text-gray-500">{label}:</span>
    <span className="min-w-0 flex-1 truncate font-medium">
      {value || "N/A"}
    </span>
  </div>
);

const DetailItem = ({
  icon,
  label,
  value,
  wide = false,
}: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  wide?: boolean;
}) => (
  <motion.div
    whileHover={{ x: 4 }}
    className={`flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-blue-500/10 hover:border-blue-500/25 transition-all ${
      wide ? "sm:col-span-2" : ""
    }`}
  >
    <span className="text-blue-400 mt-1 shrink-0">{icon}</span>
    <div className="min-w-0 flex-1">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">
        {label}
      </p>
      <p className="text-gray-200 font-medium mt-1 break-words">
        {value || "N/A"}
      </p>
    </div>
  </motion.div>
);

const formatDate = (date?: Date | string | null) => {
  if (!date) return "N/A";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "N/A";

  return parsed.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getInitials = (name?: string) => {
  if (!name) return "V";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "V";

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
};

export default VendorApproval;
