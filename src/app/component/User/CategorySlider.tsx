"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { FaAngleLeft } from "react-icons/fa6";
import { FaAngleRight } from "react-icons/fa6";
import {
  LuApple,
  LuBlocks,
  LuBookOpen,
  LuCar,
  LuDumbbell,
  LuGift,
  LuShirt,
  LuSmartphone,
  LuSofa,
  LuSparkles,
} from "react-icons/lu";

const CATEGORY_MAP = [
  {
    label: "Fashion & Lifestyle",
    viLabel: "Fashion & Lifestyle",
    Icon: LuShirt,
    tile: "bg-rose-500/10 border-rose-500/20",
    icon: "text-rose-400",
  },
  {
    label: "Electronics & Gadgets",
    viLabel: "Electronics & Gadgets",
    Icon: LuSmartphone,
    tile: "bg-sky-500/10 border-sky-500/20",
    icon: "text-sky-400",
  },
  {
    label: "Home & Living",
    viLabel: "Home & Living",
    Icon: LuSofa,
    tile: "bg-amber-500/10 border-amber-500/20",
    icon: "text-amber-400",
  },
  {
    label: "Beauty & Personal Care",
    viLabel: "Beauty & Personal Care",
    Icon: LuSparkles,
    tile: "bg-fuchsia-500/10 border-fuchsia-500/20",
    icon: "text-fuchsia-400",
  },
  {
    label: "Toys, Kids & Baby",
    viLabel: "Toys, Kids & Baby",
    Icon: LuBlocks,
    tile: "bg-violet-500/10 border-violet-500/20",
    icon: "text-violet-400",
  },
  {
    label: "Food & Grocery",
    viLabel: "Food & Grocery",
    Icon: LuApple,
    tile: "bg-emerald-500/10 border-emerald-500/20",
    icon: "text-emerald-400",
  },
  {
    label: "Sports & Fitness",
    viLabel: "Sports & Fitness",
    Icon: LuDumbbell,
    tile: "bg-orange-500/10 border-orange-500/20",
    icon: "text-orange-400",
  },
  {
    label: "Automotive Accessories",
    viLabel: "Automotive Accessories",
    Icon: LuCar,
    tile: "bg-cyan-500/10 border-cyan-500/20",
    icon: "text-cyan-400",
  },
  {
    label: "Gifts & Handcrafts",
    viLabel: "Gifts & Handcrafts",
    Icon: LuGift,
    tile: "bg-red-500/10 border-red-500/20",
    icon: "text-red-400",
  },
  {
    label: "Books & Stationery",
    viLabel: "Books & Stationery",
    Icon: LuBookOpen,
    tile: "bg-teal-500/10 border-teal-500/20",
    icon: "text-teal-400",
  },
];

function CategorySlider() {
  const [startIndex, setStartIndex] = useState(0);
  const categories = CATEGORY_MAP;

  const nextSlice = useCallback(() => {
    setStartIndex((prev) => (prev + 5) % categories.length);
  }, [categories.length]);

  const prevSlice = useCallback(() => {
    setStartIndex((prev) => (prev - 5 < 0 ? categories.length - 5 : prev - 5));
  }, [categories.length]);
  useEffect(() => {
    const interval = setInterval(nextSlice, 5000);
    return () => clearInterval(interval);
  }, [nextSlice]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
      className="relative mx-auto w-full bg-linear-to-br from-black via-gray-950 to-black p-8 text-center md:p-12 lg:p-16"
    >
      <div className="mb-4">
        <motion.div
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mx-auto mb-4 h-px w-16 bg-white/20"
        />
        <h2 className="mb-2 text-3xl font-bold tracking-tight text-white md:text-4xl lg:text-5xl">
          Shop by Categories
        </h2>
        <p className="text-sm text-zinc-500 md:text-base">
          Khám phá đa dạng sản phẩm
        </p>
      </div>

      <div className="relative overflow-visible py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={startIndex}
            initial={{ opacity: 0, x: 120 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -120 }}
            transition={{ duration: 0.6 }}
            className="grid grid-cols-1 gap-4 px-16 sm:grid-cols-2 md:grid-cols-3 md:gap-6 md:px-20 lg:grid-cols-5"
          >
            {categories.slice(startIndex, startIndex + 5).map((item, index) => {
              const Icon = item.Icon;

              return (
                <Link
                  key={index}
                  href={`/category?cat=${encodeURIComponent(item.viLabel)}`}
                  className="block"
                >
                  <motion.div
                    whileHover={{ y: -4 }}
                    whileTap={{ scale: 0.95 }}
                    className="group cursor-pointer rounded-xl border border-white/[0.08] bg-[#16181d] p-6 text-white shadow-sm shadow-black/30 transition-all duration-300 hover:border-white/15 hover:shadow-md md:p-8"
                  >
                    <div
                      className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border ${item.tile}`}
                    >
                      <Icon
                        size={26}
                        className={`${item.icon} transition-colors`}
                      />
                    </div>
                    <p className="text-sm font-semibold text-zinc-200 transition-colors duration-300 group-hover:text-white md:text-base">
                      {item.label}
                    </p>
                  </motion.div>
                </Link>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Left Navigation Button */}
        <motion.button
          onClick={prevSlice}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          className="absolute top-1/2 left-0 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-white/5 p-3 text-zinc-300 transition-all duration-300 hover:bg-white/10 hover:text-white md:p-4"
        >
          <FaAngleLeft size={20} className="md:h-6 md:w-6" />
        </motion.button>

        {/* Right Navigation Button */}
        <motion.button
          onClick={nextSlice}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          className="absolute top-1/2 right-0 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-white/5 p-3 text-zinc-300 transition-all duration-300 hover:bg-white/10 hover:text-white md:p-4"
        >
          <FaAngleRight size={20} className="md:h-6 md:w-6" />
        </motion.button>
      </div>
    </motion.div>
  );
}

export default CategorySlider;
