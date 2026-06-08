"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { FaStar, FaStore, FaBoxOpen } from "react-icons/fa";
import { AiOutlineShop } from "react-icons/ai";

interface ShopItem {
  _id: string;
  name: string;
  shopName: string;
  image: string | null;
  shopBackground: string | null;
  productCount: number;
  avgRating: number;
  reviewCount: number;
}

// Cycle through gradient palettes for banner variety
const BANNER_GRADIENTS = [
  "from-blue-900/60 via-blue-800/30 to-indigo-900/60",
  "from-purple-900/60 via-purple-800/30 to-pink-900/60",
  "from-emerald-900/60 via-teal-800/30 to-cyan-900/60",
  "from-orange-900/60 via-red-800/30 to-rose-900/60",
  "from-sky-900/60 via-blue-800/30 to-violet-900/60",
  "from-fuchsia-900/60 via-purple-800/30 to-blue-900/60",
];

export default function ShopListClient({ vendors }: { vendors: ShopItem[] }) {
  const router = useRouter();

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-10 text-center"
      >
        <div className="h-1 w-12 bg-gradient-to-r from-blue-500 to-blue-600 mx-auto mb-4 rounded-full" />
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-2 tracking-tight">
          Danh sách cửa hàng
        </h1>
        <p className="text-gray-400 text-sm">
          {vendors.length} cửa hàng đang hoạt động trên MultiCart
        </p>
      </motion.div>

      {vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          <AiOutlineShop size={60} className="mb-4 opacity-40" />
          <p className="text-lg font-semibold">Chưa có cửa hàng nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {vendors.map((vendor, i) => (
            <motion.div
              key={vendor._id}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4 }}
              className="group bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl
                         overflow-hidden flex flex-col
                         hover:-translate-y-1 hover:border-white/20 hover:shadow-xl
                         hover:shadow-black/40 transition-all duration-300"
            >
              {/* ── Banner ── */}
              <div
                className="relative h-24 rounded-t-2xl overflow-hidden"
                style={{
                  backgroundImage: vendor.shopBackground
                    ? `url(${vendor.shopBackground})`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {/* Gradient fallback when no background image */}
                {!vendor.shopBackground && (
                  <div
                    className={`absolute inset-0 bg-gradient-to-r ${BANNER_GRADIENTS[i % BANNER_GRADIENTS.length]}`}
                  />
                )}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.15) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 50%)",
                  }}
                />
              </div>

              {/* ── Body ── */}
              <div className="flex flex-col items-center px-5 pb-6 flex-1">
                {/* Avatar — nửa đè lên banner, nửa ở content, z-10 để nổi trên banner */}
                <div
                  className="w-20 h-20 rounded-full overflow-hidden shrink-0
                             border-4 border-[#0f1117]
                             bg-gray-800 flex items-center justify-center
                             -mt-10 z-10 shadow-xl relative"
                >
                  {vendor.image ? (
                    <img
                      src={vendor.image}
                      alt={vendor.shopName || vendor.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <FaStore size={34} className="text-blue-400" />
                  )}
                </div>

                {/* Shop name */}
                <h3 className="mt-3 text-white font-semibold text-base text-center leading-tight line-clamp-1">
                  {vendor.shopName || vendor.name}
                </h3>

                {/* Stats */}
                <div className="flex items-center justify-center gap-3 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <FaBoxOpen size={10} className="text-blue-400/80" />
                    {vendor.productCount} sản phẩm
                  </span>
                  <span className="w-px h-3 bg-white/10" />
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <FaStar size={10} className="text-yellow-400" />
                    {vendor.avgRating > 0
                      ? `${vendor.avgRating.toFixed(1)} (${vendor.reviewCount})`
                      : "Chưa có đánh giá"}
                  </span>
                </div>

                {/* Spacer */}
                <div className="flex-1 min-h-[16px]" />

                {/* CTA — Outline button */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => router.push(`/shop/${vendor._id}`)}
                  className="mt-4 w-3/4 py-2 rounded-xl text-sm font-medium
                             border border-blue-500/50 text-blue-400
                             hover:bg-blue-500 hover:text-white hover:border-blue-500
                             transition-all duration-200"
                >
                  Xem cửa hàng
                </motion.button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
