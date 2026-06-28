"use client";
import { IProduct } from "@/model/product.model";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaStar, FaTruck, FaShieldAlt, FaUndo } from "react-icons/fa";
import { MdLocalOffer } from "react-icons/md";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/context/ToastContext";

const SLIDE_INTERVAL = 2500; // ms

function ProductCard({
  product,
  vendorPreview = false,
}: {
  product: IProduct;
  vendorPreview?: boolean;
}) {
  const images = [
    product.image1,
    product.image2,
    product.image3,
    product.image4,
  ].filter(Boolean);

  const [currentImg, setCurrentImg] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartAdded, setCartAdded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { refreshCart } = useCart();
  const { showToast } = useToast();
  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!product.isStockAvailable || addingToCart) return;
    setAddingToCart(true);
    try {
      // Nguồn chân lý là session server (phản hồi 401), không dựa vào Redux
      // user vốn có thể chưa hydrate -> tránh báo "chưa đăng nhập" nhầm.
      const res = await fetch("/api/user/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      if (res.status === 401) {
        showToast("Vui lòng đăng nhập để tiếp tục", "info");
        return;
      }
      if (!res.ok) {
        showToast("Không thể thêm vào giỏ, vui lòng thử lại", "info");
        return;
      }
      setCartAdded(true);
      refreshCart(); // cập nhật badge Navbar
      setTimeout(() => setCartAdded(false), 2500);
    } catch {
      showToast("Không thể thêm vào giỏ, vui lòng thử lại", "info");
    } finally {
      setAddingToCart(false);
    }
  };

  const goTo = useCallback(
    (index: number, dir?: number) => {
      setDirection(dir ?? (index > currentImg ? 1 : -1));
      setCurrentImg(index);
    },
    [currentImg],
  );

  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentImg((prev) => (prev + 1) % images.length);
  }, [images.length]);

  // Auto-slide: chạy khi không hover, dừng khi hover
  useEffect(() => {
    if (images.length <= 1) return;
    if (isHovered) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(goNext, SLIDE_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isHovered, goNext, images.length]);

  const avgRating =
    product.reviews && product.reviews.length > 0
      ? product.reviews.reduce((sum, r) => sum + r.rating, 0) /
        product.reviews.length
      : null;

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  const productId = product._id?.toString() ?? "";

  return (
    <Link href={`/product/${productId}`} className="block">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        whileHover={{ y: -2 }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#16181d] shadow-sm shadow-black/30 transition-all duration-300 hover:border-white/15 hover:shadow-md"
      >
        {/* Badges */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          {product.freeDelivery && (
            <span className="flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/15 px-2 py-1 text-[10px] font-medium text-emerald-300 backdrop-blur-sm">
              <FaTruck size={9} /> Miễn phí ship
            </span>
          )}
          {product.payOnDelivery && (
            <span className="flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/15 px-2 py-1 text-[10px] font-medium text-amber-300 backdrop-blur-sm">
              <MdLocalOffer size={10} /> COD
            </span>
          )}
        </div>

        {/* Image Slider */}
        <div className="relative h-[200px] w-full overflow-hidden bg-zinc-950">
          {images.length > 0 ? (
            <>
              <AnimatePresence
                initial={false}
                custom={direction}
                mode="popLayout"
              >
                <motion.img
                  key={currentImg}
                  src={images[currentImg]}
                  alt={`${product.title} - ${currentImg + 1}`}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.45, ease: "easeInOut" }}
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
              </AnimatePresence>

              {/* Dots indicator */}
              {images.length > 1 && (
                <div className="absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        goTo(i, i > currentImg ? 1 : -1);
                      }}
                      aria-label={`Ảnh ${i + 1}`}
                      className="flex items-center justify-center"
                      style={{ minWidth: 20, minHeight: 20 }}
                    >
                      <span
                        className={`block rounded-full transition-all duration-300 ${
                          i === currentImg
                            ? "h-1.5 w-4 bg-white"
                            : "h-1.5 w-1.5 bg-white/30 hover:bg-white/60"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              )}

              {/* Số thứ tự ảnh */}
              {images.length > 1 && (
                <div className="absolute top-2 right-2 z-20 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
                  {currentImg + 1}/{images.length}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-600">
              No Image
            </div>
          )}

          {/* Gradient overlay */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent" />
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-2.5 p-4">
          {/* Category */}
          <span className="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
            {product.category}
          </span>

          {/* Title */}
          <h3 className="line-clamp-2 text-sm leading-snug font-medium text-zinc-100 transition-colors duration-200 group-hover:text-white">
            {product.title}
          </h3>

          {/* Rating */}
          {avgRating !== null ? (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <FaStar
                  key={star}
                  size={11}
                  className={
                    star <= Math.round(avgRating)
                      ? "text-amber-400"
                      : "text-zinc-700"
                  }
                />
              ))}
              <span className="ml-1 text-[10px] text-zinc-500">
                ({product.reviews?.length})
              </span>
            </div>
          ) : (
            <p className="text-[10px] text-zinc-500 italic">Chưa có đánh giá</p>
          )}

          {/* Price + Stock */}
          <div className="mt-auto flex items-center justify-between border-t border-white/[0.08] pt-3">
            <div>
              <p className="text-lg leading-none font-semibold text-white">
                {product.price.toLocaleString("vi-VN")}₫
              </p>
              <p
                className={`mt-1.5 text-[10px] font-medium ${
                  product.isStockAvailable
                    ? "text-emerald-400/90"
                    : "text-red-400/90"
                }`}
              >
                {product.isStockAvailable
                  ? `Còn ${product.stock} sản phẩm`
                  : "Hết hàng"}
              </p>
            </div>

            {/* Extra badges */}
            <div className="flex flex-col items-end gap-1">
              {product.warranty && product.warranty !== "No warranty" && (
                <span className="flex items-center gap-1 text-[9px] text-zinc-400">
                  <FaShieldAlt size={9} /> {product.warranty}
                </span>
              )}
              {product.replacementDays && product.replacementDays > 0 ? (
                <span className="flex items-center gap-1 text-[9px] text-zinc-400">
                  <FaUndo size={9} /> Đổi trả {product.replacementDays} ngày
                </span>
              ) : null}
            </div>
          </div>

          {/* Vendor */}
          {product.vendor && (
            <p className="truncate text-[10px] text-zinc-500">
              Bán bởi{" "}
              <span className="font-medium text-zinc-400">
                {product.vendor.shopName || product.vendor.name || "Vendor"}
              </span>
            </p>
          )}

          {/* Add to Cart Button */}
          {!vendorPreview && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              disabled={!product.isStockAvailable || addingToCart}
              onClick={handleAddToCart}
              className={`mt-2 w-full rounded-lg py-2.5 text-xs font-semibold tracking-wide transition-colors duration-200 ${
                product.isStockAvailable
                  ? cartAdded
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-zinc-900 hover:bg-zinc-200"
                  : "cursor-not-allowed bg-zinc-800 text-zinc-500"
              }`}
            >
              {addingToCart ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent" />
                  Đang thêm...
                </span>
              ) : cartAdded ? (
                "Đã thêm vào giỏ"
              ) : product.isStockAvailable ? (
                "Thêm vào giỏ"
              ) : (
                "Hết hàng"
              )}
            </motion.button>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export default ProductCard;
