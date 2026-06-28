"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import {
  FaStar,
  FaStore,
  FaBoxOpen,
  FaSearch,
  FaTimes,
  FaCamera,
} from "react-icons/fa";
import { AiOutlineShop } from "react-icons/ai";
import ProductCard from "@/app/component/ProductCard";
import { IUser } from "@/model/user.model";
import { IProduct } from "@/model/product.model";
import {
  ProductReviewLike,
  ProductVendorLike,
  toId,
} from "@/lib/productView";

interface Product {
  _id: string;
  title: string;
  price: number;
  image1: string;
  image2?: string | null;
  image3?: string | null;
  image4?: string | null;
  category?: string;
  isWearable: boolean;
  stock: number;
  isStockAvailable: boolean;
  freeDelivery: boolean;
  warranty: string;
  payOnDelivery?: boolean;
  replacementDays?: number;
  reviews?: ProductReviewLike[];
  vendor?: ProductVendorLike;
  reviewCount: number;
  avgRating: number;
}

interface VendorReview {
  _id?: string;
  user: { _id?: string; name?: string; image?: string };
  rating: number;
  comment?: string;
  createdAt?: string;
}

type SortKey = "default" | "asc" | "desc";
type MinRating = 0 | 1 | 2 | 3 | 4 | 5;

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <FaStar
          key={s}
          size={size}
          className={s <= Math.round(rating) ? "text-yellow-400" : "text-gray-700"}
        />
      ))}
    </span>
  );
}

export default function VendorShopView({ user }: { user: IUser }) {
  const vendorId = toId(user._id);
  const shopName = user.shopName || user.name || "My Shop";

  const [products, setProducts] = useState<Product[]>([]);
  const [vendorReviews, setVendorReviews] = useState<VendorReview[]>([]);
  const [loading, setLoading] = useState(true);

  // Local image/background state for optimistic updates
  const [localLogo, setLocalLogo] = useState<string | undefined>(user.image);
  const [localBg, setLocalBg] = useState<string | undefined>(user.shopBackground);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  // Product filters
  const [search, setSearch] = useState("");
  const [displaySearch, setDisplaySearch] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [minRating, setMinRating] = useState<MinRating>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fetchShop = async () => {
      try {
        const res = await fetch(`/api/shop/${vendorId}`);
        const data = await res.json();
        if (res.ok) {
          setProducts(data.products ?? []);
          setVendorReviews(data.vendor?.vendorReviews ?? []);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchShop();
  }, [vendorId]);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    const preview = URL.createObjectURL(file);
    setLocalLogo(preview);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await fetch("/api/vendor/shop-appearance", { method: "PATCH", body: fd });
      const data = await res.json();
      if (res.ok) {
        if (data.image) setLocalLogo(data.image);
        showToast("success", "Logo đã được cập nhật!");
      } else {
        showToast("error", data.message ?? "Cập nhật logo thất bại");
        setLocalLogo(user.image ?? undefined);
      }
    } catch {
      showToast("error", "Lỗi kết nối");
      setLocalLogo(user.image ?? undefined);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleBgUpload = async (file: File) => {
    setUploadingBg(true);
    const preview = URL.createObjectURL(file);
    setLocalBg(preview);
    try {
      const fd = new FormData();
      fd.append("background", file);
      const res = await fetch("/api/vendor/shop-appearance", { method: "PATCH", body: fd });
      const data = await res.json();
      if (res.ok) {
        if (data.shopBackground) setLocalBg(data.shopBackground);
        showToast("success", "Ảnh nền đã được cập nhật!");
      } else {
        showToast("error", data.message ?? "Cập nhật ảnh nền thất bại");
        setLocalBg(user.shopBackground ?? undefined);
      }
    } catch {
      showToast("error", "Lỗi kết nối");
      setLocalBg(user.shopBackground ?? undefined);
    } finally {
      setUploadingBg(false);
    }
  };

  const handleSearch = (val: string) => {
    setDisplaySearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  };

  const filteredProducts = useMemo(() => {
    let result = [...products];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((p) => p.title.toLowerCase().includes(q));
    }
    if (minRating > 0) {
      result = result.filter((p) => p.avgRating >= minRating);
    }
    if (sort === "asc") result.sort((a, b) => a.price - b.price);
    else if (sort === "desc") result.sort((a, b) => b.price - a.price);
    return result;
  }, [products, search, sort, minRating]);

  const avgVendorRating =
    vendorReviews.length > 0
      ? vendorReviews.reduce((s, r) => s + r.rating, 0) / vendorReviews.length
      : null;

  const heroAvgRating =
    products.length > 0
      ? products.filter((p) => p.avgRating > 0).reduce((s, p) => s + p.avgRating, 0) /
          (products.filter((p) => p.avgRating > 0).length || 1)
      : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-20 relative">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 right-4 lg:top-6 lg:right-6 z-50 max-w-[calc(100vw-2rem)] px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${
              toast.type === "success"
                ? "bg-emerald-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden file inputs */}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={logoInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleLogoUpload(file);
          e.target.value = "";
        }}
      />
      <input
        type="file"
        accept="image/*"
        className="hidden"
        ref={bgInputRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleBgUpload(file);
          e.target.value = "";
        }}
      />

      {/* ═══ Hero Banner ═══ */}
      <section className="relative overflow-hidden rounded-2xl border border-white/10 mb-8">
        {/* Background: use inline style to avoid Tailwind gradient class conflict */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: localBg
              ? `url(${localBg})`
              : "linear-gradient(to bottom right, rgb(2 44 34 / 0.6), black, rgb(3 7 18))",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* Overlay for readability */}
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />

        {/* Edit background button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => bgInputRef.current?.click()}
          disabled={uploadingBg}
          className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all"
        >
          {uploadingBg ? (
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <FaCamera size={11} />
          )}
          Đổi ảnh nền
        </motion.button>

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-12 flex flex-col sm:flex-row items-center gap-8">
          {/* Logo with edit overlay */}
          <div className="relative shrink-0 group">
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-emerald-500/50 bg-gray-800 flex items-center justify-center shadow-xl shadow-emerald-500/20">
              {localLogo ? (
                <Image
                  src={localLogo}
                  alt={shopName}
                  fill
                  sizes="112px"
                  className="object-cover"
                  unoptimized={localLogo.startsWith("blob:")}
                />
              ) : (
                <FaStore size={48} className="text-emerald-400 opacity-60" />
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="absolute inset-0 rounded-full flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {uploadingLogo ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <FaCamera size={20} className="text-white" />
              )}
            </motion.button>
          </div>

          {/* Info */}
          <div className="text-center sm:text-left">
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 drop-shadow-lg">
              {shopName}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-300 sm:justify-start">
              <span className="flex items-center gap-1.5">
                <FaBoxOpen size={13} className="text-emerald-400" />
                {products.length} sản phẩm
              </span>
              {heroAvgRating > 0 && (
                <span className="flex items-center gap-1.5">
                  <FaStar size={13} className="text-yellow-400" />
                  {heroAvgRating.toFixed(1)} trung bình sản phẩm
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-emerald-400/70 italic">
              Chạm vào logo để đổi ảnh • Nhấn &ldquo;Đổi ảnh nền&rdquo; để thay background
            </p>
          </div>
        </div>
      </section>

      {/* ═══ Products Section ═══ */}
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-emerald-500 rounded-full inline-block" />
          Sản phẩm của cửa hàng
        </h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 flex-1 min-w-[200px]">
            <FaSearch size={14} className="text-gray-500 shrink-0" />
            <input
              type="text"
              value={displaySearch}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Tìm sản phẩm..."
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
            />
            {displaySearch && (
              <button onClick={() => { setDisplaySearch(""); setSearch(""); }}>
                <FaTimes size={13} className="text-gray-500 hover:text-white transition-colors" />
              </button>
            )}
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="default" className="bg-gray-900">Giá: Mặc định</option>
            <option value="asc" className="bg-gray-900">Giá: Thấp → Cao</option>
            <option value="desc" className="bg-gray-900">Giá: Cao → Thấp</option>
          </select>

          <select
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value) as MinRating)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
          >
            <option value={0} className="bg-gray-900">★ Tất cả đánh giá</option>
            <option value={4} className="bg-gray-900">★ 4 sao trở lên</option>
            <option value={3} className="bg-gray-900">★ 3 sao trở lên</option>
            <option value={2} className="bg-gray-900">★ 2 sao trở lên</option>
          </select>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <AiOutlineShop size={48} className="mb-3 opacity-40" />
            <p className="text-sm">
              {products.length === 0
                ? "Chưa có sản phẩm nào được duyệt và hiển thị"
                : "Không tìm thấy sản phẩm phù hợp"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((p, i) => (
              <motion.div
                key={p._id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.35 }}
              >
                <ProductCard product={p as unknown as IProduct} vendorPreview />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ Vendor Reviews Section (read-only) ═══ */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-emerald-500 rounded-full inline-block" />
          Đánh giá của khách hàng
        </h2>

        {/* Rating overview */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-center"
        >
          <div className="text-center shrink-0">
            <p className="text-6xl font-black text-white">
              {avgVendorRating !== null ? avgVendorRating.toFixed(1) : "—"}
            </p>
            <div className="flex items-center gap-0.5 justify-center mt-1">
              <StarRow rating={avgVendorRating ?? 0} size={16} />
            </div>
            <p className="text-xs text-gray-500 mt-1">{vendorReviews.length} đánh giá</p>
          </div>

          <div className="flex-1 w-full space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = vendorReviews.filter((r) => Math.round(r.rating) === star).length;
              const pct = vendorReviews.length > 0 ? (count / vendorReviews.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-400 w-3 text-right">{star}</span>
                  <FaStar size={10} className="text-yellow-400 shrink-0" />
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.7, delay: (5 - star) * 0.05 }}
                      className="h-full bg-yellow-400 rounded-full"
                    />
                  </div>
                  <span className="text-gray-500 w-5 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Review list */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-6"
        >
          <h3 className="text-base font-bold mb-5 text-white flex items-center gap-2">
            <span className="w-1 h-4 bg-emerald-500 rounded-full inline-block" />
            Tất cả đánh giá ({vendorReviews.length})
          </h3>

          {vendorReviews.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-4xl mb-2">⭐</p>
              <p className="text-sm">Chưa có đánh giá nào từ khách hàng</p>
            </div>
          ) : (
            <div className="space-y-5">
              {vendorReviews.map((review, i) => (
                <motion.div
                  key={review._id ?? i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex gap-3 border-b border-white/5 pb-5 last:border-0 last:pb-0"
                >
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center text-sm font-bold shrink-0 border border-white/10">
                    {review.user?.image ? (
                      <Image
                        src={review.user.image}
                        alt="avatar"
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <span>{(review.user?.name || "K")[0].toUpperCase()}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-white">
                        {review.user?.name || "Khách hàng"}
                      </p>
                      <StarRow rating={review.rating} size={11} />
                      {review.createdAt && (
                        <span className="text-[10px] text-gray-600">
                          {new Date(review.createdAt).toLocaleDateString("vi-VN")}
                        </span>
                      )}
                    </div>
                    {review.comment && (
                      <p className="text-sm text-gray-400 leading-relaxed">{review.comment}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </section>
    </div>
  );
}
