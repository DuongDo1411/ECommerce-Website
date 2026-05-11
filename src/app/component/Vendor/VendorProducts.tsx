"use client";
import UseGetAllProducts from "@/hooks/UseGetAllProductsData";
import UseGetCurrentUser from "@/hooks/UseGetCurrentUser";
import { RootState } from "@/redux/store";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { setAllProductsData } from "@/redux/vendorSlice";
import axios from "axios";
import { FiUpload, FiX, FiCheck, FiSend, FiEdit2, FiToggleLeft, FiToggleRight } from "react-icons/fi";
import { FaBoxOpen, FaCheckCircle, FaClock, FaTag, FaLayerGroup } from "react-icons/fa";
import { ClipLoader } from "react-spinners";
import { IProduct } from "@/model/product.model";

const CATEGORIES = [
  "Fashion & Lifestyle",
  "Electronics & Gadgets",
  "Home & Living",
  "Beauty & Personal Care",
  "Toys, Kids & Baby",
  "Food & Grocery",
  "Sports & Fitness",
  "Automotive Accessories",
  "Gifts & Handcrafts",
  "Books & Stationery",
  "Others",
];
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"];

function VendorProducts() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  UseGetCurrentUser();
  UseGetAllProducts();
  const currentUser = useSelector((state: RootState) => state.user.userData);
  const { allProductsData } = useSelector((state: RootState) => state.vendor);
  const myProducts =
    currentUser?._id && allProductsData?.length
      ? allProductsData.filter(
          (p: any) =>
            p.vendor === currentUser?._id || p.vendor?._id === currentUser?._id,
        )
      : [];

  // ── Edit modal state ──
  const [editProduct, setEditProduct] = useState<IProduct | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsWearable, setEditIsWearable] = useState(false);
  const [editSizes, setEditSizes] = useState<string[]>([]);
  const [editReplacementDays, setEditReplacementDays] = useState("");
  const [editWarranty, setEditWarranty] = useState("");
  const [editFreeDelivery, setEditFreeDelivery] = useState(false);
  const [editPayOnDelivery, setEditPayOnDelivery] = useState(false);
  const [editDetailPoints, setEditDetailPoints] = useState<string[]>([]);
  const [editCurrentPoint, setEditCurrentPoint] = useState("");
  const [editImage1, setEditImage1] = useState<File | null>(null);
  const [editImage2, setEditImage2] = useState<File | null>(null);
  const [editImage3, setEditImage3] = useState<File | null>(null);
  const [editImage4, setEditImage4] = useState<File | null>(null);
  const [editPreview1, setEditPreview1] = useState<string | null>(null);
  const [editPreview2, setEditPreview2] = useState<string | null>(null);
  const [editPreview3, setEditPreview3] = useState<string | null>(null);
  const [editPreview4, setEditPreview4] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState<Record<string, boolean>>(
    {},
  );

  const openEdit = (p: IProduct) => {
    setEditProduct(p);
    setEditTitle(p.title);
    setEditDescription(p.description);
    setEditPrice(String(p.price));
    setEditStock(String(p.stock));
    setEditCategory(p.category);
    setEditIsWearable(p.isWearable);
    setEditSizes(p.size ?? []);
    setEditReplacementDays(String(p.replacementDays ?? ""));
    setEditWarranty(p.warranty ?? "");
    setEditFreeDelivery(p.freeDelivery ?? false);
    setEditPayOnDelivery(p.payOnDelivery ?? false);
    setEditDetailPoints(p.detailsPoints ?? []);
    setEditCurrentPoint("");
    setEditImage1(null);
    setEditImage2(null);
    setEditImage3(null);
    setEditImage4(null);
    setEditPreview1(null);
    setEditPreview2(null);
    setEditPreview3(null);
    setEditPreview4(null);
  };

  const closeEdit = () => setEditProduct(null);

  const handleToggleActive = async (p: any) => {
    const id = String(p._id);
    setToggleLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const { data } = await axios.patch("/api/vendor/toggleActive", {
        productId: id,
      });
      const updated = allProductsData.map((item: any) =>
        item._id === data._id ? data : item,
      );
      dispatch(setAllProductsData(updated));
    } catch (err) {
      console.error(err);
      alert("❌ Failed to update product status.");
    } finally {
      setToggleLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const toggleEditSize = (s: string) =>
    setEditSizes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const handleEditSubmit = async () => {
    if (!editProduct) return;
    setEditLoading(true);
    try {
      const fd = new FormData();
      fd.append("productId", String(editProduct._id));
      fd.append("title", editTitle);
      fd.append("description", editDescription);
      fd.append("price", editPrice);
      fd.append("stock", editStock);
      fd.append("category", editCategory);
      fd.append("isWearable", String(editIsWearable));
      editSizes.forEach((s) => fd.append("sizes", s));
      fd.append("replacementDays", editReplacementDays);
      fd.append("freeDelivery", String(editFreeDelivery));
      fd.append("warranty", editWarranty);
      fd.append("payOnDelivery", String(editPayOnDelivery));
      editDetailPoints.forEach((pt) => fd.append("detailPoints", pt));
      if (editImage1) fd.append("image1", editImage1);
      if (editImage2) fd.append("image2", editImage2);
      if (editImage3) fd.append("image3", editImage3);
      if (editImage4) fd.append("image4", editImage4);

      const { data } = await axios.patch("/api/vendor/editProduct", fd);
      // Update redux store
      const updated = allProductsData.map((p: any) =>
        p._id === data._id ? data : p,
      );
      dispatch(setAllProductsData(updated));
      setEditLoading(false);
      closeEdit();
      alert("✅ Product updated & resubmitted for admin review!");
    } catch (err) {
      console.error(err);
      setEditLoading(false);
      alert("❌ Failed to update product.");
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "approved":
        return {
          bg: "bg-emerald-500/15",
          border: "border-emerald-500/30",
          text: "text-emerald-400",
          dot: "bg-emerald-400",
          icon: "✓",
          label: "Approved",
        };
      case "rejected":
        return {
          bg: "bg-red-500/15",
          border: "border-red-500/30",
          text: "text-red-400",
          dot: "bg-red-400",
          icon: "✕",
          label: "Rejected",
        };
      default:
        return {
          bg: "bg-amber-500/15",
          border: "border-amber-500/30",
          text: "text-amber-400",
          dot: "bg-amber-400",
          icon: "⏳",
          label: "Pending",
        };
    }
  };

  return (
    <div
      className="w-full min-h-screen text-white"
      style={{ fontFamily: "'DM Sans', 'Sora', sans-serif" }}
    >
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] rounded-full bg-violet-600/6 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full p-5 sm:p-8 lg:p-10">
        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8"
        >
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-emerald-400/70 mb-1">
              Vendor Dashboard
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              My Products
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {myProducts.length} sản phẩm đã đăng
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/addVendorProduct")}
            className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm overflow-hidden group"
            style={{
              background:
                "linear-gradient(135deg, #059669 0%, #047857 50%, #065f46 100%)",
              boxShadow:
                "0 0 24px rgba(5,150,105,0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <span className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all duration-300 rounded-xl" />
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Thêm sản phẩm
          </motion.button>
        </motion.div>

        {/* ── Stats Row ── */}
        {myProducts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-3 gap-3 mb-8"
          >
            {[
              {
                label: "Tổng SP",
                value: myProducts.length,
                color: "text-blue-400",
                glow: "rgba(59,130,246,0.15)",
                border: "rgba(59,130,246,0.2)",
                Icon: FaLayerGroup,
                iconColor: "text-blue-400",
                iconBg: "bg-blue-500/10",
              },
              {
                label: "Đang bán",
                value: myProducts.filter((p: any) => p.isActive).length,
                color: "text-emerald-400",
                glow: "rgba(52,211,153,0.15)",
                border: "rgba(52,211,153,0.2)",
                Icon: FaCheckCircle,
                iconColor: "text-emerald-400",
                iconBg: "bg-emerald-500/10",
              },
              {
                label: "Chờ duyệt",
                value: myProducts.filter((p: any) => p.verificationStatus === "pending").length,
                color: "text-amber-400",
                glow: "rgba(251,191,36,0.15)",
                border: "rgba(251,191,36,0.2)",
                Icon: FaClock,
                iconColor: "text-amber-400",
                iconBg: "bg-amber-500/10",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border p-4 flex items-center gap-3"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
                  borderColor: stat.border,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px ${stat.glow}`,
                }}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                  <stat.Icon size={18} className={stat.iconColor} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest">{stat.label}</p>
                  <p className={`text-2xl font-bold leading-tight ${stat.color}`}>{stat.value}</p>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── Desktop Table (md+) ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="hidden md:block rounded-2xl border border-white/8 overflow-hidden"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <table className="w-full text-left">
            <thead>
              <tr style={{
                background: "linear-gradient(90deg, rgba(5,150,105,0.1) 0%, rgba(5,150,105,0.03) 60%, transparent 100%)",
                borderBottom: "1px solid rgba(5,150,105,0.15)",
              }}>
                {["Ảnh", "Tên sản phẩm", "Giá / Tồn kho", "Trạng thái", "Hiển thị", "Thao tác"].map((h) => (
                  <th key={h} className="px-5 py-4 text-xs font-semibold tracking-[0.12em] uppercase text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {myProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <motion.div
                        animate={{ y: [0, -8, 0] }}
                        transition={{ duration: 2.5, repeat: Infinity }}
                        className="flex flex-col items-center gap-3"
                      >
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)" }}>
                          <FaBoxOpen size={28} className="text-emerald-500/60" />
                        </div>
                        <p className="text-slate-500 text-sm">Chưa có sản phẩm nào. Hãy thêm sản phẩm đầu tiên!</p>
                      </motion.div>
                    </td>
                  </tr>
                ) : (
                  myProducts.map((p: any, index: number) => {
                    const statusCfg = getStatusConfig(p.verificationStatus);
                    return (
                      <motion.tr
                        key={index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.4 }}
                        className="group border-t border-white/5 transition-all duration-200 hover:bg-emerald-500/4"
                      >
                        {/* Image */}
                        <td className="px-5 py-4">
                          <div className="relative w-14 h-14 rounded-xl overflow-hidden ring-1 ring-white/10 group-hover:ring-emerald-500/40 transition-all duration-300">
                            <Image src={p?.image1} alt="img1" fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                          </div>
                        </td>

                        {/* Title + category */}
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-200 truncate max-w-[200px]">{p?.title}</p>
                          {p?.category && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-slate-500 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                              <FaTag size={8} /> {p.category}
                            </span>
                          )}
                        </td>

                        {/* Price + Stock */}
                        <td className="px-5 py-4">
                          <p className="text-sm font-bold text-white">
                            $<span className="text-emerald-400 ml-0.5">{p?.price}</span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Còn: <span className={`font-semibold ${p?.stock > 5 ? "text-slate-300" : "text-rose-400"}`}>{p?.stock ?? 0}</span>
                          </p>
                        </td>

                        {/* Verification Status */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.border} ${statusCfg.text} border`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} animate-pulse`} />
                            {statusCfg.label}
                          </span>
                          {p.verificationStatus === "rejected" && p.rejectedReason && (
                            <p className="text-[10px] text-red-400/70 mt-1 max-w-[160px] truncate" title={p.rejectedReason}>
                              ↳ {p.rejectedReason}
                            </p>
                          )}
                        </td>

                        {/* Active indicator */}
                        <td className="px-5 py-4">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                            ${p.isActive
                              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
                              : "bg-slate-700/30 border-slate-600/20 text-slate-500"}`}>
                            <span className={`w-2 h-2 rounded-full ${p.isActive ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-slate-600"}`} />
                            {p?.isActive ? "Active" : "Inactive"}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => openEdit(p)}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/30 transition-all"
                            >
                              <FiEdit2 size={12} /> Edit
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: toggleLoading[String(p._id)] ? 1 : 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              disabled={p.verificationStatus !== "approved" || !!toggleLoading[String(p._id)]}
                              onClick={() => handleToggleActive(p)}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all
                                ${p.verificationStatus === "approved"
                                  ? p.isActive
                                    ? "bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border-rose-500/30"
                                    : "bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border-emerald-500/30"
                                  : "bg-slate-700/30 text-slate-600 cursor-not-allowed border-slate-600/15"}`}
                            >
                              {toggleLoading[String(p._id)] ? (
                                <ClipLoader size={11} color="white" />
                              ) : p.isActive ? (
                                <><FiToggleLeft size={13} /> Disable</>
                              ) : (
                                <><FiToggleRight size={13} /> Enable</>
                              )}
                            </motion.button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </motion.div>

        {/* ── Mobile Cards (< md) ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="md:hidden flex flex-col gap-3"
        >
          {myProducts.length === 0 ? (
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              className="flex flex-col items-center gap-3 mt-14"
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(5,150,105,0.1)", border: "1px solid rgba(5,150,105,0.2)" }}>
                <FaBoxOpen size={28} className="text-emerald-500/60" />
              </div>
              <p className="text-slate-500 text-sm">Chưa có sản phẩm nào!</p>
            </motion.div>
          ) : (
            myProducts.map((p: any, index: number) => {
              const statusCfg = getStatusConfig(p.verificationStatus);
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06, duration: 0.4 }}
                  className="rounded-2xl border border-white/8 overflow-hidden"
                  style={{
                    background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
                  }}
                >
                  {/* Card top */}
                  <div className="flex gap-4 p-4">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 ring-1 ring-white/10">
                      <Image src={p.image1} alt="product" fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-white text-sm truncate">{p.title}</h3>
                      {p?.category && (
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-slate-500 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                          <FaTag size={8} /> {p.category}
                        </span>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-emerald-400 font-bold text-base">${p.price}</p>
                        <p className="text-xs text-slate-500">
                          Còn: <span className={`font-semibold ${p?.stock > 5 ? "text-slate-300" : "text-rose-400"}`}>{p?.stock ?? 0}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${statusCfg.bg} ${statusCfg.border} ${statusCfg.text} border`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border
                          ${p.isActive ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-slate-700/30 border-slate-600/20 text-slate-500"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? "bg-emerald-400" : "bg-slate-600"}`} />
                          {p.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {p.verificationStatus === "rejected" && (
                    <div className="mx-4 mb-3 bg-red-500/8 border border-red-500/20 text-red-300 text-xs p-3 rounded-xl">
                      <p className="font-semibold text-red-400">
                        Từ chối: <span className="font-normal">{p.rejectedReason || "Không có lý do"}</span>
                      </p>
                      <p className="mt-1 text-amber-400/80">✏️ Chỉnh sửa để gửi lại duyệt.</p>
                    </div>
                  )}

                  {/* Action footer */}
                  <div className="grid grid-cols-2 divide-x divide-white/8 border-t border-white/8">
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => openEdit(p)}
                      className="flex items-center justify-center gap-1.5 py-3 text-xs font-semibold text-violet-400 hover:bg-violet-500/10 transition-colors"
                    >
                      <FiEdit2 size={13} /> Chỉnh sửa
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      disabled={p.verificationStatus !== "approved" || !!toggleLoading[String(p._id)]}
                      onClick={() => handleToggleActive(p)}
                      className={`flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors
                        ${p.verificationStatus === "approved"
                          ? p.isActive
                            ? "text-rose-400 hover:bg-rose-500/10"
                            : "text-emerald-400 hover:bg-emerald-500/10"
                          : "text-slate-600 cursor-not-allowed"}`}
                    >
                      {toggleLoading[String(p._id)] ? (
                        <ClipLoader size={11} color="white" />
                      ) : p.isActive ? (
                        <><FiToggleLeft size={14} /> Tắt</>
                      ) : (
                        <><FiToggleRight size={14} /> Bật</>
                      )}
                    </motion.button>
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </div>

      {/* ── Edit Product Modal ── */}
      <AnimatePresence>
        {editProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.88, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.88, y: 30 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="relative w-full max-w-2xl rounded-2xl border border-violet-500/25 shadow-2xl shadow-violet-950/60 overflow-hidden"
              style={{
                background: "linear-gradient(145deg,#0f0c29,#1a1040,#0d0d1a)",
              }}
            >
              {/* Top accent */}
              <div className="h-1 w-full bg-linear-to-r from-violet-600 to-blue-500" />

              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/8">
                <div>
                  <h2 className="text-xl font-bold bg-linear-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                    Edit Product
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Changes will be resubmitted for admin approval
                  </p>
                </div>
                <button
                  onClick={closeEdit}
                  className="text-slate-400 hover:text-white transition-colors p-1"
                >
                  <FiX size={20} />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5 max-h-[76vh] overflow-y-auto">
                {/* Basic fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(
                    [
                      {
                        label: "Title",
                        val: editTitle,
                        set: setEditTitle,
                        type: "text",
                      },
                      {
                        label: "Price ($)",
                        val: editPrice,
                        set: setEditPrice,
                        type: "number",
                      },
                      {
                        label: "Stock",
                        val: editStock,
                        set: setEditStock,
                        type: "number",
                      },
                    ] as const
                  ).map(({ label, val, set, type }) => (
                    <div key={label}>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">
                        {label}
                      </label>
                      <input
                        type={type}
                        value={val}
                        onChange={(e) => (set as any)(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">
                      Category
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all appearance-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c} className="bg-gray-900">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all resize-none"
                  />
                </div>

                {/* Wearable + Sizes */}
                <div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={editIsWearable}
                        onChange={() => setEditIsWearable(!editIsWearable)}
                      />
                      <div className="w-5 h-5 bg-white/10 border border-white/20 rounded-md peer-checked:bg-violet-600 peer-checked:border-violet-600 transition-all" />
                      <FiCheck className="absolute top-0.5 left-0.5 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-sm text-slate-300">
                      Wearable / Clothing product
                    </span>
                  </label>
                  {editIsWearable && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {SIZE_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleEditSize(s)}
                          className={`px-4 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                            editSizes.includes(s)
                              ? "bg-violet-600 border-violet-500 text-white"
                              : "bg-white/5 border-white/20 text-slate-400"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Extra fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">
                      Replacement Days
                    </label>
                    <input
                      type="text"
                      value={editReplacementDays}
                      onChange={(e) => setEditReplacementDays(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">
                      Warranty
                    </label>
                    <input
                      type="text"
                      value={editWarranty}
                      onChange={(e) => setEditWarranty(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/15 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    />
                  </div>
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={editFreeDelivery}
                        onChange={() => setEditFreeDelivery(!editFreeDelivery)}
                      />
                      <div className="w-5 h-5 bg-white/10 border border-white/20 rounded-md peer-checked:bg-green-600 transition-all" />
                      <FiCheck className="absolute top-0.5 left-0.5 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-sm text-slate-300">
                      Free Delivery
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={editPayOnDelivery}
                        onChange={() =>
                          setEditPayOnDelivery(!editPayOnDelivery)
                        }
                      />
                      <div className="w-5 h-5 bg-white/10 border border-white/20 rounded-md peer-checked:bg-purple-600 transition-all" />
                      <FiCheck className="absolute top-0.5 left-0.5 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-sm text-slate-300">
                      Pay On Delivery
                    </span>
                  </label>
                </div>

                {/* Detail Points */}
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest mb-2 block">
                    Detail Points
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editCurrentPoint}
                      onChange={(e) => setEditCurrentPoint(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && editCurrentPoint.trim()) {
                          setEditDetailPoints((prev) => [
                            ...prev,
                            editCurrentPoint.trim(),
                          ]);
                          setEditCurrentPoint("");
                        }
                      }}
                      placeholder={`Point ${editDetailPoints.length + 1}`}
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!editCurrentPoint.trim()) return;
                        setEditDetailPoints((prev) => [
                          ...prev,
                          editCurrentPoint.trim(),
                        ]);
                        setEditCurrentPoint("");
                      }}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {editDetailPoints.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {editDetailPoints.map((pt, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2"
                        >
                          <span className="text-sm text-slate-300">
                            <span className="text-violet-400 font-semibold">
                              {i + 1}.
                            </span>{" "}
                            {pt}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setEditDetailPoints((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              )
                            }
                            className="text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-red-500/10 transition-all"
                          >
                            <FiX size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Images */}
                <div>
                  <label className="text-xs text-slate-400 uppercase tracking-widest mb-2 block">
                    Images (leave blank to keep current)
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {(
                      [
                        {
                          id: "e1",
                          cur: editProduct.image1,
                          prev: editPreview1,
                          setFile: setEditImage1,
                          setPrev: setEditPreview1,
                          label: "1",
                        },
                        {
                          id: "e2",
                          cur: editProduct.image2,
                          prev: editPreview2,
                          setFile: setEditImage2,
                          setPrev: setEditPreview2,
                          label: "2",
                        },
                        {
                          id: "e3",
                          cur: editProduct.image3,
                          prev: editPreview3,
                          setFile: setEditImage3,
                          setPrev: setEditPreview3,
                          label: "3",
                        },
                        {
                          id: "e4",
                          cur: editProduct.image4,
                          prev: editPreview4,
                          setFile: setEditImage4,
                          setPrev: setEditPreview4,
                          label: "4",
                        },
                      ] as const
                    ).map(({ id, cur, prev, setFile, setPrev, label }) => (
                      <div key={id}>
                        <input
                          type="file"
                          hidden
                          id={id}
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            (setFile as any)(f);
                            (setPrev as any)(URL.createObjectURL(f));
                          }}
                        />
                        <label
                          htmlFor={id}
                          className="cursor-pointer relative block h-24 rounded-xl border-2 border-dashed border-white/20 hover:border-violet-500/50 overflow-hidden transition-all group"
                        >
                          <Image
                            src={prev ?? cur}
                            alt={`img${label}`}
                            fill
                            className="object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                            <FiUpload
                              className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              size={18}
                            />
                          </div>
                          {prev && (
                            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center text-white text-[8px] font-bold">
                              ✓
                            </span>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-2 pb-1">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleEditSubmit}
                    disabled={editLoading}
                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-violet-500/30"
                    style={{
                      background: "linear-gradient(135deg,#7c3aed,#2563eb)",
                    }}
                  >
                    {editLoading ? (
                      <ClipLoader size={18} color="white" />
                    ) : (
                      <>
                        <FiSend size={16} /> Save & Resubmit for Review
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default VendorProducts;
