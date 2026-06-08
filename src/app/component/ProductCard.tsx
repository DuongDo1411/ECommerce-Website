"use client";
import { IProduct } from "@/model/product.model";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { FaStar, FaTruck, FaShieldAlt, FaUndo } from "react-icons/fa";
import { MdLocalOffer } from "react-icons/md";
import { useCart } from "@/context/CartContext";

const SLIDE_INTERVAL = 2500; // ms

function ProductCard({ product, vendorPreview = false }: { product: IProduct; vendorPreview?: boolean }) {
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

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!product.isStockAvailable || addingToCart) return;
    setAddingToCart(true);
    try {
      await fetch("/api/user/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      setCartAdded(true);
      refreshCart(); // cập nhật badge Navbar
      setTimeout(() => setCartAdded(false), 2500);
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

  const productId = (product._id as any)?.toString?.() ?? String(product._id);

  return (
    <Link href={`/product/${productId}`} className="block">
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4 }}
      whileHover={{ y: -6, scale: 1.02 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="group relative bg-linear-to-br from-gray-900 via-gray-800 to-gray-900
        border border-white/10 hover:border-blue-500/50 rounded-2xl overflow-hidden
        shadow-lg hover:shadow-2xl hover:shadow-blue-500/20 cursor-pointer
        transition-all duration-300 flex flex-col"
    >
      {/* Badges */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        {product.freeDelivery && (
          <span className="flex items-center gap-1 bg-green-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
            <FaTruck size={9} /> Free Ship
          </span>
        )}
        {product.payOnDelivery && (
          <span className="flex items-center gap-1 bg-orange-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm">
            <MdLocalOffer size={10} /> COD
          </span>
        )}
      </div>

      {/* Image Slider */}
      <div className="relative w-full h-[200px] bg-gray-950 overflow-hidden">
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
                className="absolute inset-0 w-full h-full object-cover"
                draggable={false}
              />
            </AnimatePresence>

            {/* Dots indicator */}
            {images.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
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
                          ? "w-4 h-1.5 bg-blue-400"
                          : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Số thứ tự ảnh */}
            {images.length > 1 && (
              <div className="absolute top-2 right-2 z-20 bg-black/50 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {currentImg + 1}/{images.length}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm">
            No Image
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-gray-900/60 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Category */}
        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest">
          {product.category}
        </span>

        {/* Title */}
        <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2 group-hover:text-blue-300 transition-colors duration-200">
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
                    ? "text-yellow-400"
                    : "text-gray-600"
                }
              />
            ))}
            <span className="text-gray-400 text-[10px] ml-1">
              ({product.reviews?.length})
            </span>
          </div>
        ) : (
          <p className="text-[10px] text-gray-500 italic">No reviews yet</p>
        )}

        {/* Price + Stock */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/10">
          <div>
            <p className="text-blue-400 font-bold text-base">
              {product.price.toLocaleString("vi-VN")}₫
            </p>
            <p
              className={`text-[10px] font-medium ${
                product.isStockAvailable ? "text-green-400" : "text-red-400"
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
              <span className="flex items-center gap-0.5 text-[9px] text-purple-300">
                <FaShieldAlt size={9} /> {product.warranty}
              </span>
            )}
            {product.replacementDays && product.replacementDays > 0 ? (
              <span className="flex items-center gap-0.5 text-[9px] text-cyan-300">
                <FaUndo size={9} /> {product.replacementDays}d return
              </span>
            ) : null}
          </div>
        </div>

        {/* Vendor */}
        {product.vendor && (
          <p className="text-[10px] text-gray-500 truncate">
            Sold by{" "}
            <span className="text-gray-400 font-medium">
              {(product.vendor as any).shopName ||
                (product.vendor as any).name ||
                "Vendor"}
            </span>
          </p>
        )}

        {/* Add to Cart Button */}
        {!vendorPreview && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            disabled={!product.isStockAvailable || addingToCart}
            onClick={handleAddToCart}
            className={`w-full mt-2 py-2 rounded-xl text-xs font-bold tracking-wide transition-all duration-300 ${
              product.isStockAvailable
                ? cartAdded
                  ? "bg-green-600 text-white"
                  : "bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-md hover:shadow-blue-500/40"
                : "bg-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {addingToCart ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang thêm...
              </span>
            ) : cartAdded ? (
              "✓ Đã thêm vào giỏ!"
            ) : product.isStockAvailable ? (
              "🛒 Add to Cart"
            ) : (
              "Out of Stock"
            )}
          </motion.button>
        )}
      </div>
    </motion.div>
    </Link>
  );
}

export default ProductCard;
