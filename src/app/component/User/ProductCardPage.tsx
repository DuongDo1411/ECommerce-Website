"use client";
import { RootState } from "@/redux/store";
import React from "react";
import { useSelector } from "react-redux";
import ProductCard from "../ProductCard";
import { motion } from "motion/react";

function ProductCardPage() {
  // allProductsData đã được fetch bởi InitUser (UseGetAllProducts)
  // Chỉ cần đọc từ Redux và filter phía client
  const allProductsData = useSelector(
    (state: RootState) => state?.vendor?.allProductsData ?? [],
  );

  const products = Array.isArray(allProductsData)
    ? allProductsData.filter(
        (p: any) => p.isActive === true && p.verificationStatus === "approved",
      )
    : [];

  return (
    <section className="min-h-screen w-full bg-linear-to-br from-gray-900 via-black to-gray-900 px-4 py-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="max-w-7xl mx-auto mb-10 text-center"
      >
        <div className="h-1 w-16 bg-linear-to-r from-blue-500 to-blue-600 mx-auto mb-4 rounded-full" />
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
          Explore Verified &amp; Trending Products
        </h2>
        <p className="text-gray-400 text-sm sm:text-base mt-2">
          Shop only from approved sellers with guaranteed quality
        </p>
        {products.length > 0 && (
          <p className="text-blue-400/70 text-xs mt-1">
            {products.length} product{products.length > 1 ? "s" : ""} available
          </p>
        )}
      </motion.div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto">
        {products.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center py-24 flex flex-col items-center gap-4"
          >
            <span className="text-6xl">🛍️</span>
            <p className="text-gray-400 text-lg font-medium">
              No products available right now.
            </p>
            <p className="text-gray-600 text-sm">
              Check back soon — vendors are adding new items!
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {products.map((p: any, index: number) => (
              <motion.div
                key={p._id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <ProductCard product={p} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default ProductCardPage;
