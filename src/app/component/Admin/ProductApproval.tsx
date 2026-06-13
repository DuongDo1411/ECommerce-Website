"use client";

import type { AppDispatch, RootState } from "@/redux/store";
import type { IProduct } from "@/model/product.model";
import { AnimatePresence, motion } from "motion/react";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FaStore,
  FaTag,
  FaLayerGroup,
  FaAlignLeft,
  FaCircleDot,
  FaDollarSign,
  FaCalendarDays,
  FaMagnifyingGlass,
  FaBoxOpen,
  FaWarehouse,
} from "react-icons/fa6";
import { MdPendingActions } from "react-icons/md";
import { IoCheckmarkCircle, IoCloseCircle } from "react-icons/io5";
import axios from "axios";
import { ClipLoader } from "react-spinners";
import UseGetAllProducts from "@/hooks/UseGetAllProductsData";
import Image from "next/image";
import { setAllProductsData } from "@/redux/vendorSlice";

type ModalStep = "detail" | "reject";

function ProductApproval() {
  const dispatch = useDispatch<AppDispatch>();
  UseGetAllProducts();
  const allProductsData: IProduct[] = useSelector(
    (state: RootState) => state.vendor.allProductsData,
  );
  const pendingProducts = Array.isArray(allProductsData)
    ? allProductsData.filter((p) => p.verificationStatus == "pending")
    : [];

  const [selectedProduct, setSelectedProduct] = useState<IProduct | null>(null);
  const [previewImage, setPreviewImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<ModalStep>("detail");
  const [search, setSearch] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");

  const searchTerm = search.trim().toLowerCase();
  const filteredProducts = pendingProducts.filter((product) => {
    if (!searchTerm) return true;
    return [product.title, product.category, product.vendor?.shopName].some(
      (value) => value?.toLowerCase().includes(searchTerm),
    );
  });

  const openProductModal = (product: IProduct) => {
    setSelectedProduct(product);
    setPreviewImage(product.image1);
    setStep("detail");
    setRejectedReason("");
  };

  const closeProductModal = () => {
    if (loading) return;
    setSelectedProduct(null);
    setPreviewImage("");
    setStep("detail");
    setRejectedReason("");
  };

  const openRejectStep = () => {
    setStep("reject");
    setRejectedReason("");
  };

  const handleApproved = async () => {
    if (!selectedProduct) return;
    setLoading(true);
    try {
      await axios.post("/api/admin/update_product_status", {
        productId: selectedProduct?._id,
        status: "approved",
      });
      const updated = allProductsData.filter(
        (p) => p._id !== selectedProduct?._id,
      );
      dispatch(setAllProductsData(updated));
      setSelectedProduct(null);
      setPreviewImage("");
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
    if (!selectedProduct) return;
    setLoading(true);
    try {
      await axios.post("/api/admin/update_product_status", {
        productId: selectedProduct?._id,
        status: "rejected",
        rejectedReason,
      });
      const updated = allProductsData.filter(
        (p) => p._id !== selectedProduct?._id,
      );
      dispatch(setAllProductsData(updated));
      setSelectedProduct(null);
      setPreviewImage("");
      setStep("detail");
      setRejectedReason("");
      setLoading(false);
      alert("Product Rejected");
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
            Products Approval Requests
          </h1>
        </div>
        <p className="text-gray-400 text-sm ml-4">
          Manage and approve pending products requests
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5"
      >
        <StatsCard
          icon={<FaBoxOpen />}
          label="Pending Products"
          value={pendingProducts.length}
          tone="amber"
        />
        <StatsCard
          icon={<IoCheckmarkCircle />}
          label="Approved Today"
          value="-"
          tone="green"
        />
        <StatsCard
          icon={<FaWarehouse />}
          label="Total Products"
          value={Array.isArray(allProductsData) ? allProductsData.length : 0}
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
            placeholder="Search by product, category, or vendor"
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
              <th className="p-4 font-semibold text-blue-400">Image</th>
              <th className="p-4 font-semibold text-blue-400">Title</th>
              <th className="p-4 font-semibold text-blue-400">Category</th>
              <th className="p-4 font-semibold text-blue-400">Vendor</th>
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
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-14">
                  <EmptyState hasSearch={Boolean(searchTerm)} />
                </td>
              </tr>
            ) : (
              filteredProducts.map((product, index) => (
                <motion.tr
                  key={String(product._id ?? index)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                  whileHover={{ backgroundColor: "rgba(59, 130, 246, 0.05)" }}
                  className="border-t border-blue-500/10 transition-all"
                >
                  <td className="p-4">
                    <Image
                      src={product.image1}
                      alt={product.title}
                      width={52}
                      height={52}
                      className="h-[52px] w-[52px] rounded-xl object-cover shadow-lg shadow-black/30"
                    />
                  </td>
                  <td className="p-4">
                    <p className="font-medium text-white line-clamp-1">
                      {product?.title || "N/A"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatPrice(product?.price)}
                    </p>
                  </td>
                  <td className="p-4">
                    <CategoryBadge value={product?.category} />
                  </td>
                  <td className="p-4 text-gray-300">
                    {getVendorName(product)}
                  </td>
                  <td className="p-4 text-gray-300">
                    {formatDate(product?.requestedAt)}
                  </td>
                  <td className="p-4">
                    <PendingBadge />
                  </td>
                  <td className="p-4 text-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => openProductModal(product)}
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
        {filteredProducts.length === 0 ? (
          <EmptyState hasSearch={Boolean(searchTerm)} />
        ) : (
          filteredProducts.map((product, index) => (
            <motion.div
              key={String(product._id ?? index)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="bg-linear-to-br from-white/8 to-white/4 border border-blue-500/20 rounded-xl p-5 space-y-4 shadow-lg shadow-black/20 hover:shadow-blue-500/10 transition-all"
            >
              <div className="flex items-start gap-4">
                <Image
                  src={product.image1}
                  alt={product.title}
                  width={80}
                  height={80}
                  className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-lg shadow-black/30"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-white line-clamp-2">
                    {product.title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-400">
                    {formatPrice(product.price)}
                  </p>
                  <div className="mt-2">
                    <CategoryBadge value={product.category} />
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <InfoRow
                  icon={<FaStore size={15} />}
                  label="Vendor"
                  value={getVendorName(product)}
                />
                <InfoRow
                  icon={<FaCalendarDays size={15} />}
                  label="Requested"
                  value={formatDate(product.requestedAt)}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-blue-500/10">
                <PendingBadge compact />
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="min-w-32 bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-sm font-semibold py-2.5 px-4 rounded-lg shadow-lg shadow-blue-500/30 transition-all"
                  onClick={() => openProductModal(product)}
                >
                  View Details
                </motion.button>
              </div>
            </motion.div>
          ))
        )}
      </motion.div>

      <AnimatePresence>
        {selectedProduct && (
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
              className="relative bg-linear-to-br from-gray-900 via-[#0a0f1e] to-gray-950 rounded-2xl w-full max-w-3xl border border-blue-500/25 shadow-2xl shadow-blue-950/60 overflow-hidden overflow-y-auto max-h-[90vh]"
            >
              {loading && (
                <div className="absolute inset-0 z-30 bg-black/30 backdrop-blur-[1px]" />
              )}

              <div className="h-1 w-full bg-linear-to-r from-amber-400 via-blue-500 to-green-400" />

              <motion.div
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05, duration: 0.35 }}
                className="relative h-48 bg-linear-to-br from-blue-950/60 to-black flex items-center justify-center overflow-hidden"
              >
                <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#0a0f1e] z-10" />
                <Image
                  src={previewImage || selectedProduct.image1}
                  alt={selectedProduct.title}
                  width={150}
                  height={150}
                  className="relative z-20 max-h-36 w-auto rounded-xl border border-white/10 object-contain shadow-2xl shadow-black/60"
                />
                <span className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/20 border border-yellow-400/40 text-yellow-300">
                  <FaCircleDot size={8} className="animate-pulse" />
                  Pending Review
                </span>
              </motion.div>

              <div className="px-6 pt-4 md:px-8">
                <div className="flex gap-2 overflow-x-auto pb-4">
                  {getProductImages(selectedProduct).map((image, index) => (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      disabled={loading}
                      onClick={() => setPreviewImage(image)}
                      className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border transition ${
                        (previewImage || selectedProduct.image1) === image
                          ? "border-blue-400 ring-2 ring-blue-500/30"
                          : "border-white/10 hover:border-blue-400/50"
                      }`}
                    >
                      <Image
                        src={image}
                        alt={`${selectedProduct.title} preview ${index + 1}`}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 pt-2 md:p-8 md:pt-3">
                <AnimatePresence mode="wait">
                  {step === "detail" ? (
                    <motion.div
                      key="detail"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="mb-5 pb-4 border-b border-blue-500/20">
                        <h3 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                          Product Details
                        </h3>
                        <p className="text-gray-400 text-sm mt-1">
                          Review product information before approval
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
                        <DetailItem
                          icon={<FaTag size={14} />}
                          label="Title"
                          value={selectedProduct.title}
                        />
                        <DetailItem
                          icon={<FaDollarSign size={14} />}
                          label="Price"
                          value={formatPrice(selectedProduct.price)}
                        />
                        <DetailItem
                          icon={<FaLayerGroup size={14} />}
                          label="Category"
                          value={selectedProduct.category}
                        />
                        <DetailItem
                          icon={<FaStore size={14} />}
                          label="Vendor"
                          value={getVendorName(selectedProduct)}
                        />
                        <DetailItem
                          icon={<FaCalendarDays size={14} />}
                          label="Requested At"
                          value={formatDate(selectedProduct.requestedAt)}
                        />
                        <DetailItem
                          icon={<FaWarehouse size={14} />}
                          label="Stock"
                          value={String(selectedProduct.stock ?? "N/A")}
                        />
                        <DetailItem
                          icon={<FaAlignLeft size={14} />}
                          label="Description"
                          value={selectedProduct.description}
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
                          onClick={openRejectStep}
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
                          onClick={closeProductModal}
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
                            Provide a clear reason before rejecting this product.
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

const CategoryBadge = ({ value }: { value?: string }) => (
  <span className="inline-flex max-w-40 items-center rounded-full border border-indigo-400/25 bg-indigo-500/12 px-3 py-1 text-xs font-semibold text-indigo-300">
    <span className="truncate">{value || "N/A"}</span>
  </span>
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
      <FaBoxOpen />
    </motion.div>
    <h3 className="text-lg font-bold text-white">
      {hasSearch ? "No Matching Products" : "No Pending Products"}
    </h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-gray-400">
      {hasSearch
        ? "No pending product requests match your current search."
        : "All product submissions have been reviewed. New requests will appear here."}
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

const formatPrice = (price?: number) =>
  price != null ? `$${price.toLocaleString()}` : "N/A";

const getVendorName = (product: IProduct) =>
  product.vendor?.shopName || product.vendor?.name || "N/A";

const getProductImages = (product: IProduct) =>
  [product.image1, product.image2, product.image3, product.image4].filter(
    Boolean,
  );

export default ProductApproval;
