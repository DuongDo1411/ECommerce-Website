"use client";
import { motion } from "motion/react";
import Image from "next/image";
import React, { useState } from "react";
import { FiUpload, FiX, FiCheck } from "react-icons/fi";

function AddVendorProduct() {
  const categories = [
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
  const sizeOptions = ["XS", "S", "M", "L", "XL", "XXL"];

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isWearable, setIsWearable] = useState(false);
  const [sizes, setSizes] = useState<string[]>([]);
  const [replacementDays, setReplacementDays] = useState("");
  const [warranty, setWarranty] = useState("");
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [payOnDelivery, setPayOnDelivery] = useState(false);
  const [image1, setImage1] = useState<File | null>(null);
  const [image2, setImage2] = useState<File | null>(null);
  const [image3, setImage3] = useState<File | null>(null);
  const [image4, setImage4] = useState<File | null>(null);

  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [preview3, setPreview3] = useState<string | null>(null);
  const [preview4, setPreview4] = useState<string | null>(null);
  const [detailPoints, setDetailPoints] = useState<string[]>([]);
  const [currentPoint, setCurrentPoint] = useState("");

  const toggleSize = (size: string) => {
    setSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size],
    );
  };

  const handleAddPoint = () => {
    if (!currentPoint.trim()) return;
    setDetailPoints((prev) => [...prev, currentPoint]);
    setCurrentPoint("");
  };

  const handleRemove = (i: number) => {
    setDetailPoints((prev) => prev.filter((_, index) => index !== i));
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-950 via-gray-900 to-black text-white px-4 pt-8 pb-12">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className="max-w-5xl mx-auto"
      >
        {/* Header Section */}
        <motion.div variants={itemVariants} className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-1 w-12 bg-linear-to-br from-blue-500 to-blue-600 rounded-full"></div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-linear-to-br from-blue-400 to-blue-600 bg-clip-text text-transparent">
              Add New Product
            </h1>
          </div>
          <p className="text-gray-400 text-sm ml-4">
            Fill in the details to list your product
          </p>
        </motion.div>

        {/* Main Form Container */}
        <motion.div
          variants={itemVariants}
          className="bg-linear-to-br from-white/10 to-white/5 backdrop-blur-2xl p-8 sm:p-12 rounded-3xl border border-white/20 shadow-2xl"
        >
          {/* Basic Information Section */}
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold">
                1
              </span>
              Basic Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <motion.input
                whileFocus={{ scale: 1.02 }}
                onChange={(e) => setTitle(e.target.value)}
                value={title}
                type="text"
                className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 transition-all duration-300"
                placeholder="Product Title"
              />
              <motion.input
                whileFocus={{ scale: 1.02 }}
                onChange={(e) => setPrice(e.target.value)}
                value={price}
                type="number"
                className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 transition-all duration-300"
                placeholder="Price ($)"
              />
              <motion.input
                whileFocus={{ scale: 1.02 }}
                onChange={(e) => setStock(e.target.value)}
                value={stock}
                type="number"
                className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 transition-all duration-300"
                placeholder="Stock Quantity"
              />
              <motion.select
                whileFocus={{ scale: 1.02 }}
                onChange={(e) => setCategory(e.target.value)}
                value={category}
                className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white transition-all duration-300 appearance-none cursor-pointer"
              >
                <option value="" className="bg-gray-800">
                  Select Category
                </option>
                {categories.map((cat) => (
                  <option key={cat} className="bg-gray-800" value={cat}>
                    {cat}
                  </option>
                ))}
              </motion.select>
            </div>

            {/* Custom Category */}
            {category === "Others" && (
              <motion.input
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                type="text"
                className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-5 w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 transition-all duration-300"
                placeholder="Enter Custom Category"
                onChange={(e) => setCustomCategory(e.target.value)}
                value={customCategory}
              />
            )}

            {/* Description */}
            <motion.textarea
              whileFocus={{ scale: 1.02 }}
              placeholder="Product Description"
              className="focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-5 w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-gray-500 transition-all duration-300 resize-none"
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              value={description}
            />
          </motion.div>

          {/* Wearable Section */}
          <motion.div
            variants={itemVariants}
            className="mb-8 pb-8 border-b border-white/10"
          >
            <div className="flex items-center gap-3 cursor-pointer">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isWearable}
                    onChange={(e) => setIsWearable(!isWearable)}
                  />
                  <div className="w-6 h-6 bg-white/10 border border-white/20 rounded-lg peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all duration-300"></div>
                  <FiCheck className="absolute top-1 left-1 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-300" />
                </div>
                <span className="text-sm font-medium">
                  This is a wearable / clothing product
                </span>
              </label>
            </div>

            {/* Size Options */}
            {isWearable && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5"
              >
                <p className="mb-4 text-sm font-semibold text-gray-300">
                  Select Sizes
                </p>
                <div className="flex flex-wrap gap-3">
                  {sizeOptions.map((size) => (
                    <motion.button
                      key={size}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      type="button"
                      className={`px-5 py-2 rounded-lg font-semibold border-2 transition-all duration-300 ${
                        sizes.includes(size)
                          ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/50"
                          : "bg-white/5 border-white/20 text-gray-300 hover:border-white/40"
                      }`}
                      onClick={() => toggleSize(size)}
                    >
                      {size}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Product Features Section */}
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold">
                2
              </span>
              Product Features
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <motion.input
                whileFocus={{ scale: 1.02 }}
                type="text"
                className="p-3 bg-white/5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500 transition-all duration-300"
                placeholder="Replacement Days (e.g., 7 days)"
                onChange={(e) => setReplacementDays(e.target.value)}
                value={replacementDays}
              />
              <motion.input
                whileFocus={{ scale: 1.02 }}
                type="text"
                className="p-3 bg-white/5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500 transition-all duration-300"
                placeholder="Warranty (e.g., 1 year)"
                onChange={(e) => setWarranty(e.target.value)}
                value={warranty}
              />
            </div>

            {/* Delivery Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={freeDelivery}
                    onChange={() => setFreeDelivery(!freeDelivery)}
                  />
                  <div className="w-6 h-6 bg-white/10 border border-white/20 rounded-lg peer-checked:bg-green-600 peer-checked:border-green-600 transition-all duration-300"></div>
                  <FiCheck className="absolute top-1 left-1 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-300" />
                </div>
                <span className="text-sm font-medium">Free Delivery</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={payOnDelivery}
                    onChange={() => setPayOnDelivery(!payOnDelivery)}
                  />
                  <div className="w-6 h-6 bg-white/10 border border-white/20 rounded-lg peer-checked:bg-purple-600 peer-checked:border-purple-600 transition-all duration-300"></div>
                  <FiCheck className="absolute top-1 left-1 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-300" />
                </div>
                <span className="text-sm font-medium">Pay On Delivery</span>
              </label>
            </div>
          </motion.div>

          {/* Images Section */}
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold">
                3
              </span>
              Product Images
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              Upload 4 high-quality images (JPG, PNG)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Image 1 */}
              <div>
                <input
                  type="file"
                  hidden
                  id="img1"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImage1(file);
                    setPreview1(URL.createObjectURL(file));
                  }}
                />
                <label
                  htmlFor="img1"
                  className="cursor-pointer group relative bg-linear-to-br from-white/10 to-white/5 p-3 rounded-2xl h-36 flex items-center justify-center border-2 border-dashed border-white/20 hover:border-blue-500/50 hover:bg-white/10 transition-all duration-300"
                >
                  {preview1 ? (
                    <motion.div className="relative w-full h-full rounded-lg overflow-hidden">
                      <Image
                        src={preview1}
                        alt="img1"
                        width={120}
                        height={120}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                        <FiUpload
                          className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          size={20}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500 text-xs">
                      <FiUpload
                        size={24}
                        className="mb-2 group-hover:text-blue-400 transition-colors"
                      />
                      <span className="text-center">Image 1</span>
                    </div>
                  )}
                </label>
              </div>

              {/* Image 2 */}
              <div>
                <input
                  type="file"
                  hidden
                  id="img2"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImage2(file);
                    setPreview2(URL.createObjectURL(file));
                  }}
                />
                <label
                  htmlFor="img2"
                  className="cursor-pointer group relative bg-linear-to-br from-white/10 to-white/5 p-3 rounded-2xl h-36 flex items-center justify-center border-2 border-dashed border-white/20 hover:border-blue-500/50 hover:bg-white/10 transition-all duration-300"
                >
                  {preview2 ? (
                    <motion.div className="relative w-full h-full rounded-lg overflow-hidden">
                      <Image
                        src={preview2}
                        alt="img2"
                        width={120}
                        height={120}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                        <FiUpload
                          className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          size={20}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500 text-xs">
                      <FiUpload
                        size={24}
                        className="mb-2 group-hover:text-blue-400 transition-colors"
                      />
                      <span className="text-center">Image 2</span>
                    </div>
                  )}
                </label>
              </div>

              {/* Image 3 */}
              <div>
                <input
                  type="file"
                  hidden
                  id="img3"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImage3(file);
                    setPreview3(URL.createObjectURL(file));
                  }}
                />
                <label
                  htmlFor="img3"
                  className="cursor-pointer group relative bg-linear-to-br from-white/10 to-white/5 p-3 rounded-2xl h-36 flex items-center justify-center border-2 border-dashed border-white/20 hover:border-blue-500/50 hover:bg-white/10 transition-all duration-300"
                >
                  {preview3 ? (
                    <motion.div className="relative w-full h-full rounded-lg overflow-hidden">
                      <Image
                        src={preview3}
                        alt="img3"
                        width={120}
                        height={120}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                        <FiUpload
                          className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          size={20}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500 text-xs">
                      <FiUpload
                        size={24}
                        className="mb-2 group-hover:text-blue-400 transition-colors"
                      />
                      <span className="text-center">Image 3</span>
                    </div>
                  )}
                </label>
              </div>

              {/* Image 4 */}
              <div>
                <input
                  type="file"
                  hidden
                  id="img4"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImage4(file);
                    setPreview4(URL.createObjectURL(file));
                  }}
                />
                <label
                  htmlFor="img4"
                  className="cursor-pointer group relative bg-linear-to-br from-white/10 to-white/5 p-3 rounded-2xl h-36 flex items-center justify-center border-2 border-dashed border-white/20 hover:border-blue-500/50 hover:bg-white/10 transition-all duration-300"
                >
                  {preview4 ? (
                    <motion.div className="relative w-full h-full rounded-lg overflow-hidden">
                      <Image
                        src={preview4}
                        alt="img4"
                        width={120}
                        height={120}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                        <FiUpload
                          className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          size={20}
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center text-gray-500 text-xs">
                      <FiUpload
                        size={24}
                        className="mb-2 group-hover:text-blue-400 transition-colors"
                      />
                      <span className="text-center">Image 4</span>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </motion.div>

          {/* Product Details Section */}
          <motion.div variants={itemVariants} className="mb-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold">
                4
              </span>
              Product Details
            </h2>
            <div className="flex gap-3">
              <motion.input
                whileFocus={{ scale: 1.02 }}
                type="text"
                className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500 transition-all duration-300"
                placeholder={`Point ${detailPoints.length + 1}`}
                onChange={(e) => setCurrentPoint(e.target.value)}
                value={currentPoint}
                onKeyPress={(e) => e.key === "Enter" && handleAddPoint()}
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                className="px-6 bg-linear-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-blue-600/30"
                onClick={handleAddPoint}
              >
                Add
              </motion.button>
            </div>

            {/* Detail Points List */}
            {detailPoints.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-3"
              >
                {detailPoints.map((point, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex justify-between items-center bg-linear-to-br from-white/5 to-white/2 p-4 rounded-xl border border-white/10 hover:border-white/20 transition-all duration-300"
                  >
                    <span className="text-sm text-gray-300">
                      <span className="font-semibold text-blue-400">
                        {index + 1}.
                      </span>{" "}
                      {point}
                    </span>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      type="button"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-all duration-300"
                      onClick={() => handleRemove(index)}
                    >
                      <FiX size={18} />
                    </motion.button>
                  </motion.li>
                ))}
              </motion.div>
            )}
          </motion.div>

          {/* Submit Button */}
          <motion.div
            variants={itemVariants}
            className="pt-8 border-t border-white/10"
          >
            <motion.button
              whileHover={{
                scale: 1.02,
                boxShadow: "0 20px 25px -5px rgba(59, 130, 246, 0.4)",
              }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-linear-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 py-4 rounded-xl font-bold text-lg transition-all duration-300 shadow-lg shadow-blue-600/30 text-white"
            >
              Add Product
            </motion.button>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default AddVendorProduct;
