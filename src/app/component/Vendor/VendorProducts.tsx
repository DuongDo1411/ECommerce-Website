"use client";
import UseGetAllProducts from "@/hooks/UseGetAllProductsData";
import UseGetCurrentUser from "@/hooks/UseGetCurrentUser";
import { RootState } from "@/redux/store";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { AppDispatch } from "@/redux/store";
import { setAllProductsData } from "@/redux/vendorSlice";
import axios from "axios";
import { FiUpload, FiX, FiCheck, FiSend, FiEdit2, FiToggleLeft, FiToggleRight, FiSearch } from "react-icons/fi";
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

/** A single per-size stock entry used by the edit form. */
type SizeStockRow = { size: string; stock: number };

/**
 * A product row as it actually arrives in this component's Redux state / API
 * responses. Shaped from IProduct but with a flexible `vendor` because the data
 * may carry the vendor either as a raw id string or as a populated object.
 */
type VendorProduct = Omit<IProduct, "vendor"> & {
  vendor?: string | { _id?: string };
};

/** Response from toggling a product's active status (the updated product). */
type ToggleActiveResponse = VendorProduct;

/** A React state setter for either a string or a File-or-null value. */
type StringSetter = React.Dispatch<React.SetStateAction<string>>;
type FileSetter = React.Dispatch<React.SetStateAction<File | null>>;
type PreviewSetter = React.Dispatch<React.SetStateAction<string | null>>;

function VendorProducts() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  UseGetCurrentUser();
  UseGetAllProducts();
  const currentUser = useSelector((state: RootState) => state.user.userData);
  const { allProductsData } = useSelector((state: RootState) => state.vendor);
  const myProducts: VendorProduct[] = useMemo(() => {
    if (!currentUser?._id || !allProductsData?.length) return [];

    return (allProductsData as VendorProduct[]).filter((p) => {
      const vendorId =
        typeof p.vendor === "string" ? p.vendor : p.vendor?._id;
      return vendorId === currentUser._id;
    });
  }, [allProductsData, currentUser?._id]);

  // ── Edit modal state ──
  const [editProduct, setEditProduct] = useState<VendorProduct | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsWearable, setEditIsWearable] = useState(false);
  const [editSizeStock, setEditSizeStock] = useState<SizeStockRow[]>([]);
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

  /* ── Filter states ── */
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "approved" | "rejected" | "pending">("all");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [filterCategory, setFilterCategory] = useState("all");

  /* ── Derived: filtered list ── */
  const filteredProducts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return myProducts.filter((p) => {
      if (q) {
        const matchTitle = p.title?.toLowerCase().includes(q);
        const matchCategory = p.category?.toLowerCase().includes(q);
        if (!matchTitle && !matchCategory) return false;
      }
      if (filterStatus !== "all" && p.verificationStatus !== filterStatus) return false;
      if (filterActive === "active" && !p.isActive) return false;
      if (filterActive === "inactive" && p.isActive) return false;
      if (filterCategory !== "all" && p.category !== filterCategory) return false;
      return true;
    });
  }, [myProducts, searchText, filterStatus, filterActive, filterCategory]);

  const activeFilterCount = [
    searchText !== "",
    filterStatus !== "all",
    filterActive !== "all",
    filterCategory !== "all",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchText("");
    setFilterStatus("all");
    setFilterActive("all");
    setFilterCategory("all");
  };

  const openEdit = (p: VendorProduct) => {
    setEditProduct(p);
    setEditTitle(p.title);
    setEditDescription(p.description);
    setEditPrice(String(p.price));
    setEditStock(String(p.stock));
    setEditCategory(p.category);
    setEditIsWearable(p.isWearable);
    // Nếu product đã có sizeStock (đã nhập từng size) → dùng nguyên
    // Nếu chưa có (product cũ dùng stock tổng) → phân bổ stock tổng đều vào các size
    let existingSizeStock: SizeStockRow[];
    const rawSizeStock: SizeStockRow[] | undefined = p.sizeStock;
    if (rawSizeStock && rawSizeStock.length > 0) {
      existingSizeStock = rawSizeStock;
    } else {
      const sizeList = p.size ?? [];
      const totalStock = p.stock ?? 0;
      const perSize = sizeList.length > 0 ? Math.floor(totalStock / sizeList.length) : 0;
      const remainder = sizeList.length > 0 ? totalStock % sizeList.length : 0;
      existingSizeStock = sizeList.map((s: string, i: number) => ({
        size: s,
        stock: perSize + (i === 0 ? remainder : 0), // phần dư vào size đầu
      }));
    }
    setEditSizeStock(existingSizeStock);
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

  const handleToggleActive = async (p: VendorProduct) => {
    const id = String(p._id);
    setToggleLoading((prev) => ({ ...prev, [id]: true }));
    try {
      const { data } = await axios.patch<ToggleActiveResponse>(
        "/api/vendor/toggleActive",
        { productId: id },
      );
      const updated = allProductsData.map((item) =>
        String(item._id) === String(data._id) ? (data as IProduct) : item,
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
    setEditSizeStock((prev) => {
      const exists = prev.find((x) => x.size === s);
      if (exists) return prev.filter((x) => x.size !== s);
      return [...prev, { size: s, stock: 0 }];
    });

  const updateEditSizeStock = (s: string, qty: number) =>
    setEditSizeStock((prev) =>
      prev.map((x) => (x.size === s ? { ...x, stock: Math.max(0, qty) } : x)),
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
      if (editIsWearable) {
        fd.append("sizeStock", JSON.stringify(editSizeStock));
      }
      fd.append("replacementDays", editReplacementDays);
      fd.append("freeDelivery", String(editFreeDelivery));
      fd.append("warranty", editWarranty);
      fd.append("payOnDelivery", String(editPayOnDelivery));
      editDetailPoints.forEach((pt) => fd.append("detailPoints", pt));
      if (editImage1) fd.append("image1", editImage1);
      if (editImage2) fd.append("image2", editImage2);
      if (editImage3) fd.append("image3", editImage3);
      if (editImage4) fd.append("image4", editImage4);

      await axios.patch("/api/vendor/editProduct", fd);
      // Re-fetch toàn bộ sản phẩm để đảm bảo Redux đồng bộ chính xác với DB
      const refreshed = await axios.get("/api/vendor/allProduct");
      dispatch(setAllProductsData(refreshed.data));
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
      className="w-full text-white"
      style={{ fontFamily: "'DM Sans', 'Sora', sans-serif" }}
    >
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] rounded-full bg-blue-600/8 blur-[120px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] rounded-full bg-violet-600/6 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full">
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
              {filteredProducts.length !== myProducts.length
                ? `${filteredProducts.length} / ${myProducts.length} sản phẩm`
                : `${myProducts.length} sản phẩm đã đăng`}
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
                value: myProducts.filter((p) => p.isActive).length,
                color: "text-emerald-400",
                glow: "rgba(52,211,153,0.15)",
                border: "rgba(52,211,153,0.2)",
                Icon: FaCheckCircle,
                iconColor: "text-emerald-400",
                iconBg: "bg-emerald-500/10",
              },
              {
                label: "Chờ duyệt",
                value: myProducts.filter((p) => p.verificationStatus === "pending").length,
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
                className="rounded-2xl border p-3 sm:p-4 flex items-center gap-2 sm:gap-3"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
                  borderColor: stat.border,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 20px ${stat.glow}`,
                }}
              >
                <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.iconBg}`}>
                  <stat.Icon size={18} className={stat.iconColor} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest">{stat.label}</p>
                  <p className={`text-xl sm:text-2xl font-bold leading-tight ${stat.color}`}>{stat.value}</p>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── Search + Filters ── */}
        {myProducts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="mb-5 space-y-3"
          >
            {/* Search input */}
            <div className="relative">
              <FiSearch
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                size={14}
              />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm theo tên sản phẩm, danh mục..."
                className="w-full pl-9 pr-9 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  <FiX size={13} />
                </button>
              )}
            </div>

            {/* Filter dropdowns */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Verification status */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                className={`bg-white/5 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                  filterStatus !== "all"
                    ? "border-emerald-500/60 text-emerald-300"
                    : "border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                <option value="all">Trạng thái duyệt</option>
                <option value="approved">Approved</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Active status */}
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value as typeof filterActive)}
                className={`bg-white/5 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                  filterActive !== "all"
                    ? "border-emerald-500/60 text-emerald-300"
                    : "border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                <option value="all">Hiển thị</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              {/* Category */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className={`bg-white/5 border text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer transition-colors ${
                  filterCategory !== "all"
                    ? "border-emerald-500/60 text-emerald-300"
                    : "border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                <option value="all">Danh mục</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Clear filters */}
              {activeFilterCount > 0 && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl hover:bg-red-500/20 transition-colors"
                >
                  <FiX size={11} />
                  Xóa bộ lọc ({activeFilterCount})
                </motion.button>
              )}
            </div>
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
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-14 text-center">
                      <p className="text-slate-500 text-sm">Không tìm thấy sản phẩm phù hợp</p>
                      {activeFilterCount > 0 && (
                        <button
                          onClick={clearFilters}
                          className="mt-2 text-xs text-emerald-400 hover:underline"
                        >
                          Xóa bộ lọc
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, index) => {
                    const statusCfg = getStatusConfig(p.verificationStatus ?? "");
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
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-14 rounded-2xl border border-white/8" style={{ background: "rgba(255,255,255,0.02)" }}>
              <p className="text-slate-500 text-sm">Không tìm thấy sản phẩm phù hợp</p>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-xs text-emerald-400 hover:underline"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          ) : (
            filteredProducts.map((p, index) => {
              const statusCfg = getStatusConfig(p.verificationStatus ?? "");
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
                  <div className="flex gap-3 p-3">
                    <div className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 ring-1 ring-white/10">
                      <Image src={p.image1} alt="product" fill className="object-cover" />
                      {/* Verification status overlay */}
                      <span className={`absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-md ${statusCfg.bg} ${statusCfg.border} ${statusCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                    </div>
                    <div className="flex flex-1 min-w-0 flex-col">
                      <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2">{p.title}</h3>
                      {p?.category && (
                        <span className="mt-1 inline-flex w-fit items-center gap-1 text-[10px] text-slate-500 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                          <FaTag size={8} /> {p.category}
                        </span>
                      )}
                      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                        <div className="min-w-0">
                          <p className="text-emerald-400 font-bold text-lg leading-none">${p.price}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            Kho: <span className={`font-semibold ${p?.stock > 5 ? "text-slate-300" : "text-rose-400"}`}>{p?.stock ?? 0}</span>
                          </p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border
                          ${p.isActive ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" : "bg-slate-700/30 border-slate-600/20 text-slate-500"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${p.isActive ? "bg-emerald-400" : "bg-slate-600"}`} />
                          {p.isActive ? "Đang bán" : "Đã ẩn"}
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
            className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center px-4 py-4 sm:py-6 overflow-y-auto"
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
              <div className="flex items-center justify-between px-4 sm:px-6 pt-5 pb-4 border-b border-white/8">
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

              <div className="px-4 sm:px-6 py-5 space-y-5 max-h-[78vh] sm:max-h-[76vh] overflow-y-auto">
                {/* Basic fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(
                    [
                      {
                        label: "Title",
                        val: editTitle,
                        set: setEditTitle,
                        type: "text",
                        show: true,
                      },
                      {
                        label: "Price ($)",
                        val: editPrice,
                        set: setEditPrice,
                        type: "number",
                        show: true,
                      },
                      {
                        label: "Stock",
                        val: editStock,
                        set: setEditStock,
                        type: "number",
                        show: !editIsWearable,
                      },
                    ] as const
                  ).filter(({ show }) => show).map(({ label, val, set, type }) => (
                    <div key={label}>
                      <label className="text-xs text-slate-400 uppercase tracking-widest mb-1 block">
                        {label}
                      </label>
                      <input
                        type={type}
                        value={val}
                        onChange={(e) => (set as StringSetter)(e.target.value)}
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

                {/* Wearable + Sizes with per-size stock */}
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
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-slate-500 mb-2">
                        Chọn size và nhập số lượng tồn kho cho từng size
                      </p>
                      {/* Hint khi product cũ chưa có sizeStock từng size */}
                      {editProduct && !editProduct.sizeStock?.length && (editProduct.stock ?? 0) > 0 && (
                        <p className="text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
                          ℹ️ Tổng tồn kho cũ: <span className="font-bold">{editProduct.stock}</span> sản phẩm. Số lượng đã được chia đều cho các size — vui lòng điều chỉnh lại cho đúng.
                        </p>
                      )}

                      {SIZE_OPTIONS.map((s) => {
                        const entry = editSizeStock.find((x) => x.size === s);
                        const isSelected = !!entry;
                        return (
                          <div key={s} className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleEditSize(s)}
                              className={`w-14 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                                isSelected
                                  ? "bg-violet-600 border-violet-500 text-white"
                                  : "bg-white/5 border-white/20 text-slate-400 hover:border-white/40"
                              }`}
                            >
                              {s}
                            </button>
                            {isSelected && (
                              <input
                                type="number"
                                min={0}
                                value={entry.stock}
                                onChange={(e) =>
                                  updateEditSizeStock(s, Number(e.target.value))
                                }
                                className="w-28 px-2 py-1.5 bg-white/5 border border-violet-500/40 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all"
                                placeholder="Số lượng"
                              />
                            )}
                            {isSelected && (
                              <span className="text-xs text-slate-500">sản phẩm</span>
                            )}
                          </div>
                        );
                      })}
                      {editSizeStock.length > 0 && (
                        <p className="text-xs text-violet-400 pt-1">
                          Tổng tồn kho:{" "}
                          <span className="font-bold">
                            {editSizeStock.reduce((sum, x) => sum + x.stock, 0)}
                          </span>{" "}
                          sản phẩm
                        </p>
                      )}
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
                            (setFile as FileSetter)(f);
                            (setPrev as PreviewSetter)(URL.createObjectURL(f));
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
