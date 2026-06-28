"use client";
import { IProduct } from "@/model/product.model";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaShieldAlt,
  FaStar,
  FaTicketAlt,
  FaTruck,
  FaUndo,
} from "react-icons/fa";
import { MdLocalOffer } from "react-icons/md";
import { useCart } from "@/context/CartContext";
import VoucherCard from "@/app/component/VoucherCard";
import { sortVouchers } from "@/app/component/Voucher/sortVouchers";
import { useCollectVoucher } from "@/app/component/Voucher/useCollectVoucher";
import {
  toId,
  getPopulatedUser,
  ProductVendorLike,
  ProductReviewLike,
  PublicVoucher,
} from "@/lib/productView";

interface Props {
  product: IProduct;
}

export default function ProductDetailClient({ product }: Props) {
  const router = useRouter();

  const images = [
    product.image1,
    product.image2,
    product.image3,
    product.image4,
  ].filter(Boolean);

  // Mặc định hiển thị image1 (index 0)
  const [selectedImg, setSelectedImg] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(
    product.sizeStock && product.sizeStock.length > 0
      ? product.sizeStock[0].size
      : (product.size?.[0] ?? null),
  );
  const [qty, setQty] = useState(1);

  // Tính stock của size đang chọn (wearable) hoặc stock tổng (non-wearable)
  const selectedSizeStock =
    product.isWearable && product.sizeStock && selectedSize
      ? (product.sizeStock.find((s: { size: string; stock: number }) => s.size === selectedSize)?.stock ?? 0)
      : product.stock;
  const isCurrentSizeAvailable = selectedSizeStock > 0;
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMsg, setCartMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const [showVoucherModal, setShowVoucherModal] = useState(false);

  useEffect(() => {
    if (!showVoucherModal) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowVoucherModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showVoucherModal]);

  const productId = toId(product._id);
  const { refreshCart } = useCart();
  const { collectVoucher, collectingId, collectedIds, message: voucherMsg } = useCollectVoucher();

  useEffect(() => {
    fetch(`/api/vouchers?productId=${productId}&limit=4&sort=bestValue`)
      .then((res) => res.json())
      .then((data) => setVouchers(data.vouchers ?? []))
      .catch(() => setVouchers([]));
  }, [productId]);

  const sortedVouchers = sortVouchers(vouchers);
  const topVouchers = sortedVouchers.slice(0, 3);
  const bestVoucher = sortedVouchers[0];
  const bestVoucherLabel = bestVoucher
    ? bestVoucher.discountType === "freeship"
      ? "Freeship"
      : bestVoucher.discountType === "percentage"
        ? `Giảm ${bestVoucher.discountValue}%`
        : `Giảm ${Number(bestVoucher.discountValue ?? 0).toLocaleString("vi-VN")}₫`
    : "";

  const handleAddToCart = async (goToCart = false) => {
    if (!isCurrentSizeAvailable) return;
    if (product.isWearable && !selectedSize) {
      setCartMsg({ type: "error", text: "Vui lòng chọn kích cỡ!" });
      return;
    }
    setAddingToCart(true);
    setCartMsg(null);
    try {
      const res = await fetch("/api/user/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          quantity: qty,
          ...(product.isWearable && selectedSize ? { size: selectedSize } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCartMsg({ type: "error", text: data.message ?? "Thêm thất bại" });
      } else {
        setCartMsg({ type: "success", text: "Đã thêm vào giỏ hàng! 🛒" });
        refreshCart(); // cập nhật badge Navbar
        if (goToCart) {
          router.push("/cart");
          return;
        }
        setTimeout(() => setCartMsg(null), 3000);
      }
    } catch {
      setCartMsg({ type: "error", text: "Lỗi kết nối" });
    } finally {
      setAddingToCart(false);
    }
  };

  const avgRating =
    product.reviews && product.reviews.length > 0
      ? product.reviews.reduce((sum, r) => sum + r.rating, 0) /
        product.reviews.length
      : null;

  const vendor = product.vendor as ProductVendorLike | undefined;

  return (
    <div className="min-h-screen w-full bg-linear-to-br from-gray-950 via-black to-gray-950 text-white">
      {/* Back Button */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors duration-200 group"
        >
          <FaArrowLeft
            size={13}
            className="group-hover:-translate-x-1 transition-transform duration-200"
          />
          Quay lại
        </motion.button>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ═══ LEFT — Image Gallery ═══ */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-4"
        >
          {/* Ảnh to chính — mặc định image1 */}
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-900 border border-white/10 shadow-xl">
            <motion.img
              key={selectedImg}
              src={images[selectedImg]}
              alt={product.title}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="w-full h-full object-cover"
              draggable={false}
            />

            {/* Badges */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
              {product.freeDelivery && (
                <span className="flex items-center gap-1 bg-green-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                  <FaTruck size={10} /> Free Ship
                </span>
              )}
              {product.payOnDelivery && (
                <span className="flex items-center gap-1 bg-orange-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                  <MdLocalOffer size={11} /> COD
                </span>
              )}
              {bestVoucher && (
                <span className="flex items-center gap-1 bg-blue-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm">
                  <FaTicketAlt size={10} /> {bestVoucherLabel}
                </span>
              )}
            </div>

            {/* Gradient overlay bottom */}
            <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent pointer-events-none" />
          </div>

          {/* Thumbnails nhỏ bên dưới */}
          {images.length > 1 && (
            <div className="flex gap-2.5">
              {images.map((img, i) => (
                <motion.button
                  key={i}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedImg(i)}
                  className={`relative flex-1 aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                    i === selectedImg
                      ? "border-blue-500 shadow-lg shadow-blue-500/30"
                      : "border-white/10 opacity-55 hover:opacity-90 hover:border-white/30"
                  }`}
                >
                  <Image
                    src={img}
                    alt={`Ảnh ${i + 1}`}
                    fill
                    sizes="(max-width: 768px) 25vw, 120px"
                    className="object-cover"
                    draggable={false}
                  />
                  {/* Active indicator */}
                  {i === selectedImg && (
                    <div className="absolute inset-0 ring-2 ring-inset ring-blue-500/50 rounded-xl" />
                  )}
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>

        {/* ═══ RIGHT — Product Info ═══ */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col gap-5"
        >
          {/* Category + Title */}
          <div>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
              {product.category}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">
              {product.title}
            </h1>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <FaStar
                  key={star}
                  size={14}
                  className={
                    avgRating !== null && star <= Math.round(avgRating)
                      ? "text-yellow-400"
                      : "text-gray-600"
                  }
                />
              ))}
            </div>
            {avgRating !== null ? (
              <span className="text-sm text-gray-400">
                {avgRating.toFixed(1)} ({product.reviews?.length} đánh giá)
              </span>
            ) : (
              <span className="text-sm text-gray-500 italic">
                Chưa có đánh giá
              </span>
            )}
          </div>

          {/* Price */}
          <div className="flex items-end gap-3">
            <p className="text-3xl font-black text-blue-400">
              {product.price.toLocaleString("vi-VN")}₫
            </p>
            <span
              className={`text-sm font-semibold mb-1 ${
                isCurrentSizeAvailable ? "text-green-400" : "text-red-400"
              }`}
            >
              {isCurrentSizeAvailable
                ? `Còn ${selectedSizeStock} sản phẩm`
                : "Hết hàng"}
            </span>
          </div>

          {topVouchers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-white">Voucher có thể lưu</p>
                {sortedVouchers.length > 3 && (
                  <button
                    onClick={() => setShowVoucherModal(true)}
                    className="text-xs font-semibold text-blue-300 hover:text-blue-200"
                  >
                    Xem thêm &gt;
                  </button>
                )}
              </div>
              <div className="grid gap-2">
                {topVouchers.map((voucher) => {
                  const collected = voucher.collected || collectedIds.has(voucher._id);
                  return (
                    <VoucherCard
                      key={voucher._id}
                      voucher={voucher}
                      accent="blue"
                      collected={collected}
                      actionLabel={
                        collected
                          ? "Đã lưu"
                          : collectingId === voucher._id
                            ? "Đang lưu..."
                            : "Lưu"
                      }
                      onClick={() => !collected && collectVoucher(voucher._id)}
                    />
                  );
                })}
              </div>
              {voucherMsg && <p className="text-xs text-emerald-300">{voucherMsg}</p>}
            </div>
          )}

          {/* Divider */}
          <div className="h-px w-full bg-white/10" />

          {/* Size selector */}
          {product.isWearable && product.sizeStock && product.sizeStock.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-300 mb-2">
                Kích cỡ:{" "}
                <span className="text-white">{selectedSize ?? "—"}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {product.sizeStock.map((s: { size: string; stock: number }) => {
                  const outOfStock = s.stock === 0;
                  return (
                    <button
                      key={s.size}
                      disabled={outOfStock}
                      onClick={() => {
                        setSelectedSize(s.size);
                        setQty(1);
                      }}
                      className={`relative px-4 py-1.5 rounded-lg border text-sm font-medium transition-all duration-200 ${
                        selectedSize === s.size
                          ? "border-blue-500 bg-blue-500/20 text-blue-300"
                          : outOfStock
                          ? "border-white/10 text-gray-600 cursor-not-allowed line-through"
                          : "border-white/20 text-gray-400 hover:border-white/40 hover:text-white"
                      }`}
                    >
                      {s.size}
                      {outOfStock && (
                        <span className="absolute -top-1.5 -right-1.5 text-[9px] bg-red-500/80 text-white rounded-full px-1">
                          hết
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold text-gray-300">Số lượng:</p>
            <div className="flex items-center border border-white/20 rounded-xl overflow-hidden">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 text-lg font-bold"
              >
                −
              </button>
              <span className="px-4 py-1.5 text-white font-bold text-sm min-w-10 text-center">
                {qty}
              </span>
              <button
                onClick={() =>
                  setQty((q) => Math.min(selectedSizeStock || 99, q + 1))
                }
                className="px-3 py-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-200 text-lg font-bold"
              >
                +
              </button>
            </div>
          </div>

          {/* Add to Cart Buttons */}
          <div className="flex flex-col gap-3">
            {/* Cart message */}
            {cartMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium ${
                  cartMsg.type === "success"
                    ? "bg-green-500/15 text-green-400 border border-green-500/30"
                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                }`}
              >
                {cartMsg.text}
              </motion.div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {/* Thêm vào giỏ hàng */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                disabled={!isCurrentSizeAvailable || addingToCart}
                onClick={() => handleAddToCart(false)}
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all duration-300 ${
                  isCurrentSizeAvailable && !addingToCart
                    ? "bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg hover:shadow-blue-500/40"
                    : "bg-gray-800 text-gray-600 cursor-not-allowed"
                }`}
              >
                {addingToCart ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang thêm...
                  </span>
                ) : isCurrentSizeAvailable ? (
                  "🛒 Thêm vào giỏ hàng"
                ) : (
                  "Hết hàng"
                )}
              </motion.button>

              {/* Mua ngay */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                whileHover={{ scale: 1.02 }}
                disabled={!isCurrentSizeAvailable || addingToCart}
                onClick={() => handleAddToCart(true)}
                className={`flex-1 py-3.5 rounded-2xl font-bold text-sm tracking-wide border transition-all duration-300 ${
                  isCurrentSizeAvailable && !addingToCart
                    ? "border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:border-blue-400"
                    : "border-gray-700 text-gray-600 cursor-not-allowed"
                }`}
              >
                ⚡ Mua ngay
              </motion.button>
            </div>
          </div>

          {/* Perks row */}
          <div className="grid grid-cols-2 gap-2">
            {product.freeDelivery && (
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                <FaTruck size={13} className="text-green-400" />
                <span className="text-xs text-gray-300">
                  Miễn phí vận chuyển
                </span>
              </div>
            )}
            {product.payOnDelivery && (
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                <MdLocalOffer size={14} className="text-orange-400" />
                <span className="text-xs text-gray-300">
                  Thanh toán khi nhận hàng
                </span>
              </div>
            )}
            {product.warranty && product.warranty !== "No warranty" && (
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                <FaShieldAlt size={12} className="text-purple-400" />
                <span className="text-xs text-gray-300">
                  Bảo hành: {product.warranty}
                </span>
              </div>
            )}
            {product.replacementDays && product.replacementDays > 0 ? (
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                <FaUndo size={12} className="text-cyan-400" />
                <span className="text-xs text-gray-300">
                  Đổi trả trong {product.replacementDays} ngày
                </span>
              </div>
            ) : null}
          </div>

          {/* Vendor */}
          {vendor && (
            <motion.div
              whileHover={{ scale: 1.01, borderColor: "rgba(59,130,246,0.4)" }}
              whileTap={{ scale: 0.98 }}
              onClick={() =>
                router.push(
                  `/shop/${toId(vendor._id) || vendor.id}`
                )
              }
              className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:bg-white/8 transition-colors duration-200"
            >
              {/* Avatar: ảnh thật nếu có, fallback về chữ cái đầu */}
              <div className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-blue-500/40 shrink-0 bg-blue-600/20 flex items-center justify-center">
                {vendor.image ? (
                  <Image
                    src={vendor.image}
                    alt={
                      vendor.shopName ||
                      vendor.name ||
                      "Vendor"
                    }
                    fill
                    sizes="44px"
                    className="object-cover"
                    draggable={false}
                  />
                ) : (
                  <span className="text-blue-400 font-bold text-base">
                    {(vendor.shopName ||
                      vendor.name ||
                      "V")[0].toUpperCase()}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">Người bán</p>
                <p className="text-sm font-semibold text-white truncate">
                  {vendor.shopName ||
                    vendor.name ||
                    "Vendor"}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <FaCheckCircle size={14} className="text-blue-400" />
                <span className="text-xs text-blue-400 font-medium">Xem shop</span>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ═══ BOTTOM — Description & Details ═══ */}
      <div className="max-w-7xl mx-auto px-4 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
        {/* Description */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-6"
        >
          <h2 className="text-base font-bold mb-3 text-white flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
            Mô tả sản phẩm
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">
            {product.description}
          </p>
        </motion.div>

        {/* Detail points */}
        {product.detailsPoints && product.detailsPoints.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <h2 className="text-base font-bold mb-3 text-white flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
              Thông tin chi tiết
            </h2>
            <ul className="space-y-2">
              {product.detailsPoints.map((point, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-gray-400"
                >
                  <FaCheckCircle
                    size={13}
                    className="text-blue-400 mt-0.5 shrink-0"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </div>

      {/* ═══ Reviews Section ═══ */}
      <AnimatePresence>
        {showVoucherModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
            onClick={() => setShowVoucherModal(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pdp-voucher-title"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              className="max-h-[82vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-gray-950 p-5"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 id="pdp-voucher-title" className="text-lg font-bold">Tất cả voucher</h3>
                <button
                  onClick={() => setShowVoucherModal(false)}
                  className="rounded-lg bg-white/10 px-3 py-1 text-sm text-gray-300 hover:text-white"
                >
                  Đóng
                </button>
              </div>
              <div className="grid gap-3">
                {sortedVouchers.map((voucher) => {
                  const collected = voucher.collected || collectedIds.has(voucher._id);
                  return (
                    <VoucherCard
                      key={voucher._id}
                      voucher={voucher}
                      accent="blue"
                      variant="vertical"
                      collected={collected}
                      actionLabel={
                        collected
                          ? "Đã lưu"
                          : collectingId === voucher._id
                            ? "Đang lưu..."
                            : "Lưu"
                      }
                      onClick={() => !collected && collectVoucher(voucher._id)}
                    />
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReviewSection product={product} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  ReviewSection — tách ra để dùng state riêng                */
/* ─────────────────────────────────────────────────────────── */
function ReviewSection({ product }: { product: IProduct }) {
  const productId = toId(product._id);

  // Local reviews state — bắt đầu từ dữ liệu server, cập nhật sau submit
  const [reviews, setReviews] = useState<ProductReviewLike[]>(
    (product.reviews ?? []) as ProductReviewLike[],
  );
  const [hoverRating, setHoverRating] = useState(0);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      setSubmitMsg({ type: "error", text: "Vui lòng chọn số sao đánh giá!" });
      return;
    }
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const formData = new FormData();
      formData.append("rating", String(rating));
      if (comment.trim()) formData.append("comment", comment.trim());
      if (imageFile) formData.append("image", imageFile);

      const res = await fetch(`/api/user/products/${productId}/review`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitMsg({ type: "error", text: data.message ?? "Gửi thất bại" });
      } else {
        setReviews((prev) => [data.review, ...prev]);
        setRating(0);
        setComment("");
        removeImage();
        setSubmitMsg({
          type: "success",
          text: "Đánh giá của bạn đã được ghi nhận! 🎉",
        });
      }
    } catch {
      setSubmitMsg({ type: "error", text: "Lỗi kết nối, vui lòng thử lại." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 pb-20 space-y-6">
      {/* ─── Tổng quan rating ─── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-center"
      >
        <div className="text-center shrink-0">
          <p className="text-6xl font-black text-white">
            {avgRating !== null ? avgRating.toFixed(1) : "—"}
          </p>
          <div className="flex items-center gap-0.5 justify-center mt-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <FaStar
                key={s}
                size={16}
                className={
                  avgRating !== null && s <= Math.round(avgRating)
                    ? "text-yellow-400"
                    : "text-gray-700"
                }
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {reviews.length} đánh giá
          </p>
        </div>

        {/* Rating bars */}
        <div className="flex-1 w-full space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = reviews.filter(
              (r) => Math.round(r.rating) === star,
            ).length;
            const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0;
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

      {/* ─── Form viết review ─── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-white/5 border border-white/10 rounded-2xl p-6"
      >
        <h2 className="text-base font-bold mb-5 text-white flex items-center gap-2">
          <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
          Viết đánh giá của bạn
        </h2>

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
                onClick={() => setRating(star)}
                className="transition-transform duration-100 hover:scale-125"
                aria-label={`${star} sao`}
              >
                <FaStar
                  size={28}
                  className={`transition-colors duration-100 ${
                    star <= (hoverRating || rating)
                      ? "text-yellow-400"
                      : "text-gray-600"
                  }`}
                />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-sm text-yellow-400 font-semibold">
                {["", "Rất tệ", "Tệ", "Bình thường", "Tốt", "Xuất sắc"][rating]}
              </span>
            )}
          </div>
        </div>

        {/* Comment textarea */}
        <div className="mb-4">
          <p className="text-sm text-gray-400 mb-2">Nhận xét (tuỳ chọn)</p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm này..."
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all duration-200"
          />
        </div>

        {/* Image upload */}
        <div className="mb-5">
          <p className="text-sm text-gray-400 mb-2">
            Ảnh sản phẩm thực tế (tuỳ chọn)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            id="review-image"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
          {imagePreview ? (
            <div className="relative inline-block">
              <Image
                src={imagePreview}
                alt="preview"
                width={96}
                height={96}
                className="w-24 h-24 object-cover rounded-xl border border-white/20"
                unoptimized
              />
              <button
                onClick={removeImage}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-400 transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <label
              htmlFor="review-image"
              className="flex items-center gap-2 w-fit cursor-pointer border border-dashed border-white/20 hover:border-blue-500/50 rounded-xl px-4 py-3 text-sm text-gray-500 hover:text-gray-300 transition-all duration-200"
            >
              <span className="text-lg">📷</span>
              Tải ảnh lên
            </label>
          )}
        </div>

        {/* Submit message */}
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

        {/* Submit button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          whileHover={{ scale: 1.02 }}
          onClick={handleSubmit}
          disabled={submitting || rating === 0}
          className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${
            submitting || rating === 0
              ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : "bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-md hover:shadow-blue-500/30"
          }`}
        >
          {submitting ? "Đang gửi..." : "Gửi đánh giá"}
        </motion.button>
      </motion.div>

      {/* ─── Danh sách reviews ─── */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="bg-white/5 border border-white/10 rounded-2xl p-6"
      >
        <h2 className="text-base font-bold mb-5 text-white flex items-center gap-2">
          <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
          Tất cả đánh giá ({reviews.length})
        </h2>

        {reviews.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <p className="text-4xl mb-2">⭐</p>
            <p className="text-sm">
              Chưa có đánh giá nào. Hãy là người đầu tiên!
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {reviews.map((review: ProductReviewLike, i: number) => {
              const reviewUser = getPopulatedUser(review.user);
              return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex gap-3 border-b border-white/5 pb-5 last:border-0 last:pb-0"
              >
                {/* Avatar */}
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center text-sm font-bold shrink-0 border border-white/10">
                  {reviewUser.image ? (
                    <Image
                      src={reviewUser.image}
                      alt="avatar"
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    <span>{(reviewUser.name || "U")[0].toUpperCase()}</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {/* Name + Rating + Date */}
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-white">
                      {reviewUser.name || "Khách hàng"}
                    </p>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <FaStar
                          key={star}
                          size={11}
                          className={
                            star <= review.rating
                              ? "text-yellow-400"
                              : "text-gray-700"
                          }
                        />
                      ))}
                    </div>
                    {review.createdAt && (
                      <span className="text-[10px] text-gray-600">
                        {new Date(review.createdAt).toLocaleDateString("vi-VN")}
                      </span>
                    )}
                  </div>

                  {/* Comment */}
                  {review.comment && (
                    <p className="text-sm text-gray-400 leading-relaxed mb-2">
                      {review.comment}
                    </p>
                  )}

                  {/* Review Image */}
                  {review.image && (
                    <Image
                      src={review.image}
                      alt="Ảnh đánh giá"
                      width={96}
                      height={96}
                      className="w-24 h-24 object-cover rounded-xl border border-white/10 mt-1 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(review.image, "_blank")}
                    />
                  )}
                </div>
              </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
