import { AppDispatch, RootState } from "@/redux/store";
import { AnimatePresence, motion } from "motion/react";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FaStore,
  FaPhone,
  FaEnvelope,
  FaMapLocationDot,
  FaFileInvoice,
  FaTag,
  FaLayerGroup,
  FaAlignLeft,
  FaCircleDot,
  FaDollarSign,
} from "react-icons/fa6";
import { IoCheckmarkCircle, IoCloseCircle } from "react-icons/io5";
import axios from "axios";
import { ClipLoader } from "react-spinners";
import UseGetAllProducts from "@/hooks/UseGetAllProductsData";
import Product, { IProduct } from "@/model/product.model";
import Image from "next/image";
import { setAllProductsData } from "@/redux/vendorSlice";

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

  const [loading, setLoading] = useState(false);

  const [rejectModel, setRejectModel] = useState(false);

  const [rejectedReason, setRejectedReason] = useState("");

  const openRejectReasonArea = () => {
    setRejectModel(true);
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
      {/* Header */}
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

      {/* Desktop Table */}
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
              <th className="p-4 font-semibold text-blue-400">Price</th>
              <th className="p-4 font-semibold text-blue-400">Category</th>
              <th className="p-4 font-semibold text-blue-400">Status</th>
              <th className="p-4 text-center font-semibold text-blue-400">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {pendingProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12">
                  <motion.div
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <p className="text-gray-500 text-lg">
                      ✨ No pending requests
                    </p>
                  </motion.div>
                </td>
              </tr>
            ) : (
              pendingProducts.map((product, index) => (
                <motion.tr
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.4 }}
                  whileHover={{ backgroundColor: "rgba(59, 130, 246, 0.05)" }}
                  className="border-t border-blue-500/10 transition-all"
                >
                  <td className="p-4 font-medium">
                    <Image
                      src={product.image1}
                      alt="img"
                      width={50}
                      height={50}
                      className="object-cover rounded"
                    />
                  </td>
                  <td className="p-4 text-gray-300">
                    {product?.title || "N/A"}
                  </td>
                  <td className="p-4 text-gray-300">
                    $ {product?.price || "N/A"}
                  </td>
                  <td className="p-4 text-gray-300">
                    {product?.category || "N/A"}
                  </td>
                  <td className="p-4">
                    <motion.span
                      whileHover={{ scale: 1.05 }}
                      className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold bg-linear-to-r from-blue-600/40 to-blue-500/40 text-blue-300 border border-blue-500/30"
                    >
                      ⏳ {product?.verificationStatus}
                    </motion.span>
                  </td>
                  <td className="p-4 text-center">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedProduct(product)}
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

      {/* Mobile Responsive */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="md:hidden flex flex-col gap-4"
      >
        {pendingProducts.length === 0 ? (
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-center text-gray-500 mt-10 text-lg"
          >
            ✨ No pending requests
          </motion.div>
        ) : (
          pendingProducts.map((product, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.4 }}
              whileHover={{ y: -4 }}
              className="bg-linear-to-br from-white/8 to-white/4 border border-blue-500/20 rounded-xl p-5 space-y-3 shadow-lg shadow-black/20 hover:shadow-blue-500/10 transition-all"
            >
              <div className="flex items-center">
                <Image
                  src={product.image1}
                  alt="img"
                  width={60}
                  height={60}
                  className="rounded"
                />
              </div>
              <div>
                <h3 className="font-semibold">{product.title}</h3>
                <p className="text-sm text-gray-400">$ {product.price}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">{product.category}</p>
                <span className="px-3 py-1 rounded-full text-xs bg-yellow-500/30 text-yellow-300">
                  {product?.verificationStatus}
                </span>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-4 bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-sm font-semibold py-2.5 rounded-lg shadow-lg shadow-blue-500/30 transition-all"
                onClick={() => setSelectedProduct(product)}
              >
                View Details
              </motion.button>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* Modal */}
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
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              transition={{
                duration: 0.4,
                type: "spring",
                stiffness: 200,
                damping: 24,
              }}
              className="bg-linear-to-br from-gray-900 via-[#0a0f1e] to-gray-950 rounded-2xl w-full max-w-lg border border-blue-500/25 shadow-2xl shadow-blue-950/60 overflow-hidden"
            >
              {/* Hero Image Banner */}
              <motion.div
                initial={{ opacity: 0, scale: 1.05 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05, duration: 0.4 }}
                className="relative w-full h-44 bg-linear-to-br from-blue-950/60 to-black flex items-center justify-center overflow-hidden"
              >
                {/* Decorative glow */}
                <div className="absolute inset-0 bg-linear-to-b from-transparent to-[#0a0f1e] z-10" />
                <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-600/20 rounded-full blur-3xl" />
                <Image
                  src={selectedProduct?.image1}
                  alt="img"
                  width={130}
                  height={130}
                  className="relative z-20 object-contain rounded-xl shadow-2xl shadow-black/60 border border-white/10"
                />
                {/* Pending Badge on image */}
                <span className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/20 border border-yellow-400/40 text-yellow-300">
                  <FaCircleDot size={8} className="animate-pulse" />
                  Pending Review
                </span>
              </motion.div>

              <div className="p-6 md:p-8">
                {/* Modal Header */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-5 pb-4 border-b border-blue-500/20"
                >
                  <h3 className="text-2xl font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
                    Product Details
                  </h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Review product information before approval
                  </p>
                </motion.div>

                {/* Details Section */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="space-y-2.5 mb-7"
                >
                  <DetailItem
                    icon={<FaTag size={14} />}
                    label="Title"
                    value={selectedProduct.title}
                  />
                  <DetailItem
                    icon={<FaDollarSign size={14} />}
                    label="Price"
                    value={`$${selectedProduct.price}`}
                  />
                  <DetailItem
                    icon={<FaLayerGroup size={14} />}
                    label="Category"
                    value={selectedProduct.category}
                  />
                  <DetailItem
                    icon={<FaAlignLeft size={14} />}
                    label="Description"
                    value={selectedProduct.description}
                  />
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-yellow-500/20">
                    <span className="text-yellow-400 shrink-0">
                      <FaCircleDot size={14} />
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">
                        Status
                      </p>
                      <p className="text-yellow-300 font-semibold mt-1 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block animate-pulse" />
                        Pending
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <motion.button
                    disabled={loading}
                    onClick={handleApproved}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex-1 bg-linear-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-green-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <IoCheckmarkCircle size={18} />
                    {loading ? (
                      <ClipLoader size={20} color="white" />
                    ) : (
                      "Approve"
                    )}
                  </motion.button>
                  <motion.button
                    onClick={openRejectReasonArea}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex-1 bg-linear-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    <IoCloseCircle size={18} />
                    Reject
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedProduct(null)}
                    className="flex-1 bg-white/8 hover:bg-white/12 border border-white/10 py-2.5 rounded-xl text-sm font-bold text-gray-300 transition-all"
                  >
                    Cancel
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectModel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 px-4 py-8"
          >
            <motion.div
              initial={{ scale: 0.85, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 30 }}
              transition={{
                duration: 0.4,
                type: "spring",
                stiffness: 200,
                damping: 24,
              }}
              className="bg-linear-to-br from-gray-900 via-[#0a0f1e] to-gray-950 rounded-2xl w-full max-w-lg border border-red-500/25 shadow-2xl shadow-red-950/40 overflow-hidden"
            >
              {/* Red top accent bar */}
              <div className="h-1 w-full bg-linear-to-r from-red-600 to-red-400" />

              <div className="p-6 md:p-8">
                {/* Modal Header */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mb-5 pb-4 border-b border-red-500/20"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/15 border border-red-500/30">
                      <IoCloseCircle size={18} className="text-red-400" />
                    </span>
                    <h3 className="text-2xl font-bold bg-linear-to-r from-red-400 to-red-500 bg-clip-text text-transparent">
                      Reject Product
                    </h3>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">
                    Please provide a clear reason for rejection
                  </p>
                </motion.div>

                {/* Textarea */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mb-6"
                >
                  <label className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-2 block">
                    Rejection Reason
                  </label>
                  <textarea
                    placeholder="Describe why this product is being rejected..."
                    className="w-full bg-white/5 border border-red-500/20 focus:border-red-500/50 focus:outline-none focus:ring-1 focus:ring-red-500/30 rounded-xl p-3.5 text-sm text-gray-200 placeholder-gray-600 resize-none transition-all"
                    rows={4}
                    onChange={(e) => setRejectedReason(e.target.value)}
                    value={rejectedReason}
                  />
                </motion.div>

                {/* Action Buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <motion.button
                    onClick={async () => {
                      await handleRejected();
                      setRejectModel(false);
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex-1 bg-linear-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-red-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    <IoCloseCircle size={18} />
                    {loading ? (
                      <ClipLoader size={20} color="white" />
                    ) : (
                      "Confirm Reject"
                    )}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setRejectModel(false)}
                    className="flex-1 bg-white/8 hover:bg-white/12 border border-white/10 py-2.5 rounded-xl text-sm font-bold text-gray-300 transition-all"
                  >
                    Cancel
                  </motion.button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper component for detail items
const DetailItem = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) => (
  <motion.div
    whileHover={{ x: 4 }}
    className="flex items-start gap-3 p-3 rounded-lg bg-white/5 border border-blue-500/10 hover:border-blue-500/20 transition-all"
  >
    <span className="text-blue-400 mt-1 shrink-0">{icon}</span>
    <div className="flex-1">
      <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">
        {label}
      </p>
      <p className="text-gray-200 font-medium mt-1">{value || "N/A"}</p>
    </div>
  </motion.div>
);

export default ProductApproval;
