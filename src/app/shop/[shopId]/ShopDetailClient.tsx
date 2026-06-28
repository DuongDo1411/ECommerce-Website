"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import Image from "next/image";
import {
  FaStar,
  FaStore,
  FaBoxOpen,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import { AiOutlineShop } from "react-icons/ai";
import ProductCard from "@/app/component/ProductCard";
import ChatButton from "@/app/component/Chat/ChatButton";
import VoucherCard from "@/app/component/VoucherCard";
import { sortVouchers } from "@/app/component/Voucher/sortVouchers";
import { useCollectVoucher } from "@/app/component/Voucher/useCollectVoucher";
import { ProductVendorLike, ProductReviewLike, PublicVoucher } from "@/lib/productView";
import { IProduct } from "@/model/product.model";

/* ─── Types ─── */
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

interface Vendor {
  _id: string;
  name: string;
  shopName?: string;
  image?: string;
  shopBackground?: string;
  vendorReviews?: VendorReview[];
}

type SortKey = "default" | "asc" | "desc";
type MinRating = 0 | 1 | 2 | 3 | 4 | 5;

/* ─── Stars helper ─── */
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

/* ─── Main ─── */
export default function ShopDetailClient({
  vendor,
  initialProducts,
  currentUserId,
}: {
  vendor: Vendor;
  initialProducts: Product[];
  currentUserId: string;
}) {
  const shopName = vendor.shopName || vendor.name;
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const { collectVoucher, collectingId, collectedIds, message: voucherMsg } = useCollectVoucher();

  // Product filters
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("default");
  const [minRating, setMinRating] = useState<MinRating>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displaySearch, setDisplaySearch] = useState("");

  const handleSearch = (val: string) => {
    setDisplaySearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 300);
  };

  useEffect(() => {
    fetch(`/api/vouchers?vendor=${vendor._id}&limit=4&sort=bestValue`)
      .then((res) => res.json())
      .then((data) => setVouchers(data.vouchers ?? []))
      .catch(() => setVouchers([]));
  }, [vendor._id]);

  const sortedVouchers = useMemo(() => sortVouchers(vouchers), [vouchers]);

  const filteredProducts = useMemo(() => {
    let result = [...initialProducts];
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
  }, [initialProducts, search, sort, minRating]);

  // Vendor review state
  const [vendorReviews, setVendorReviews] = useState<VendorReview[]>(
    vendor.vendorReviews ?? [],
  );
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const avgVendorRating =
    vendorReviews.length > 0
      ? vendorReviews.reduce((s, r) => s + r.rating, 0) / vendorReviews.length
      : null;

  // Product-based rating for hero section
  const heroAvgRating =
    initialProducts.length > 0
      ? initialProducts.reduce((s, p) => s + (p.avgRating || 0), 0) /
        initialProducts.filter((p) => p.avgRating > 0).length || 0
      : 0;

  const handleReviewSubmit = useCallback(async () => {
    if (reviewRating === 0) {
      setSubmitMsg({ type: "error", text: "Vui lòng chọn số sao đánh giá!" });
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch(`/api/shop/${vendor._id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitMsg({ type: "error", text: data.message ?? "Gửi thất bại" });
      } else {
        setVendorReviews((prev) => [data.review, ...prev]);
        setReviewRating(0);
        setReviewComment("");
        setSubmitMsg({ type: "success", text: "Đánh giá của bạn đã được ghi nhận! 🎉" });
      }
    } catch {
      setSubmitMsg({ type: "error", text: "Lỗi kết nối, vui lòng thử lại." });
    } finally {
      setSubmitting(false);
    }
  }, [vendor._id, reviewRating, reviewComment]);

  return (
    <div className="pb-20">
      <ChatButton
        vendorId={vendor._id}
        currentUserId={currentUserId}
        vendorName={shopName}
        vendorImage={vendor.image}
      />

      {/* ═══ Hero Banner ═══ */}
      <section className="relative overflow-hidden border-b border-white/10">
        {/* Background: inline style to avoid Tailwind gradient conflict */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: vendor.shopBackground
              ? `url(${vendor.shopBackground})`
              : "linear-gradient(to bottom right, rgb(23 37 84 / 0.6), black, rgb(3 7 18))",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-black/50 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 py-14 flex flex-col sm:flex-row items-center gap-8 relative z-10">
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-blue-500/40 bg-gray-800 flex items-center justify-center shadow-xl shadow-blue-500/20 shrink-0"
          >
            {vendor.image ? (
              <Image
                src={vendor.image}
                alt={shopName}
                fill
                sizes="112px"
                className="object-cover"
              />
            ) : (
              <FaStore size={48} className="text-blue-400 opacity-60" />
            )}
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
              {shopName}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <FaBoxOpen size={13} className="text-blue-400" />
                {initialProducts.length} sản phẩm
              </span>
              {heroAvgRating > 0 && (
                <span className="flex items-center gap-1.5">
                  <FaStar size={13} className="text-yellow-400" />
                  {heroAvgRating.toFixed(1)} trung bình sản phẩm
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {sortedVouchers.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pt-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-white">Voucher của shop</h2>
              {voucherMsg && <span className="text-xs text-emerald-300">{voucherMsg}</span>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {sortedVouchers.slice(0, 4).map((voucher) => {
                const collected = voucher.collected || collectedIds.has(voucher._id);
                return (
                  <VoucherCard
                    key={voucher._id}
                    voucher={voucher}
                    collected={collected}
                    actionLabel={
                      collectingId === voucher._id
                        ? "Đang lưu..."
                        : collected
                          ? "Đã lưu"
                          : "Lưu"
                    }
                    onClick={() =>
                      !collected &&
                      collectingId !== voucher._id &&
                      collectVoucher(voucher._id)
                    }
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ═══ Products Section ═══ */}
      <section className="max-w-7xl mx-auto px-4 py-10">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
          Sản phẩm của cửa hàng
        </h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          {/* Search */}
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

          {/* Price sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="default" className="bg-gray-900">Giá: Mặc định</option>
            <option value="asc" className="bg-gray-900">Giá: Thấp → Cao</option>
            <option value="desc" className="bg-gray-900">Giá: Cao → Thấp</option>
          </select>

          {/* Star filter */}
          <select
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value) as MinRating)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value={0} className="bg-gray-900">★ Tất cả đánh giá</option>
            <option value={4} className="bg-gray-900">★ 4 sao trở lên</option>
            <option value={3} className="bg-gray-900">★ 3 sao trở lên</option>
            <option value={2} className="bg-gray-900">★ 2 sao trở lên</option>
          </select>
        </div>

        {/* Product grid */}
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <AiOutlineShop size={48} className="mb-3 opacity-40" />
            <p className="text-sm">Không tìm thấy sản phẩm phù hợp</p>
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
                <ProductCard product={p as unknown as IProduct} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ═══ Vendor Reviews Section ═══ */}
      <section className="max-w-7xl mx-auto px-4 pb-6 space-y-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
          Đánh giá cửa hàng
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
            <p className="text-xs text-gray-500 mt-1">
              {vendorReviews.length} đánh giá
            </p>
          </div>

          <div className="flex-1 w-full space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = vendorReviews.filter(
                (r) => Math.round(r.rating) === star,
              ).length;
              const pct =
                vendorReviews.length > 0
                  ? (count / vendorReviews.length) * 100
                  : 0;
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

        {/* Review form */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-6"
        >
          <h3 className="text-base font-bold mb-5 text-white flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
            Viết đánh giá của bạn
          </h3>

          {/* Star picker */}
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">
              Chọn số sao <span className="text-red-400">*</span>
            </p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setReviewRating(star)}
                  className="transition-transform duration-100 hover:scale-125"
                  aria-label={`${star} sao`}
                >
                  <FaStar
                    size={28}
                    className={`transition-colors duration-100 ${
                      star <= (hoverRating || reviewRating)
                        ? "text-yellow-400"
                        : "text-gray-600"
                    }`}
                  />
                </button>
              ))}
              {reviewRating > 0 && (
                <span className="ml-2 text-sm text-yellow-400 font-semibold">
                  {["", "Rất tệ", "Tệ", "Bình thường", "Tốt", "Xuất sắc"][reviewRating]}
                </span>
              )}
            </div>
          </div>

          {/* Comment */}
          <div className="mb-5">
            <p className="text-sm text-gray-400 mb-2">Nhận xét (tuỳ chọn)</p>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Chia sẻ trải nghiệm mua hàng tại cửa hàng này..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                         placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all"
            />
          </div>

          {submitMsg && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
                submitMsg.type === "success"
                  ? "bg-green-500/15 text-green-400 border border-green-500/30"
                  : "bg-red-500/15 text-red-400 border border-red-500/30"
              }`}
            >
              {submitMsg.text}
            </motion.div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.02 }}
            onClick={handleReviewSubmit}
            disabled={submitting || reviewRating === 0}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${
              submitting || reviewRating === 0
                ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-md hover:shadow-blue-500/30"
            }`}
          >
            {submitting ? "Đang gửi..." : "Gửi đánh giá"}
          </motion.button>
        </motion.div>

        {/* Review list */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-6"
        >
          <h3 className="text-base font-bold mb-5 text-white flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
            Tất cả đánh giá ({vendorReviews.length})
          </h3>

          {vendorReviews.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-4xl mb-2">⭐</p>
              <p className="text-sm">Chưa có đánh giá nào. Hãy là người đầu tiên!</p>
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
                  {/* Avatar */}
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
                      <p className="text-sm text-gray-400 leading-relaxed">
                        {review.comment}
                      </p>
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
