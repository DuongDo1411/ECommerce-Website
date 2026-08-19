"use client";
import axios from "axios";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FiUpload, FiX, FiCheck, FiArrowLeft } from "react-icons/fi";
import {
  FaBoxOpen,
  FaCubes,
  FaImage,
  FaListUl,
  FaTruck,
  FaTag,
} from "react-icons/fa";
import { MdStorefront } from "react-icons/md";
import { ClipLoader } from "react-spinners";
import { ToastContainer, type ToastData } from "../component/Toast";

/* ─── Dữ liệu tĩnh ─── */
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
  "Other",
];
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"];

/* ─── Sub-components ─── */
function SectionCard({
  number,
  icon: Icon,
  title,
  children,
}: {
  number: number;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: number * 0.08 }}
      className="bg-gray-900/60 border border-white/10 rounded-2xl overflow-hidden"
    >
      {/* Section header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 bg-white/3">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">
          {number}
        </span>
        <Icon size={16} className="text-blue-400 shrink-0" />
        <h2 className="font-bold text-base text-white">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </motion.div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

const inputCls =
  "w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500 transition-all duration-200 text-sm";

/* ─── Image slot ─── */
function ImageSlot({
  id,
  label,
  preview,
  onChange,
}: {
  id: string;
  label: string;
  preview: string | null;
  onChange: (file: File) => void;
}) {
  return (
    <div>
      <input
        type="file"
        hidden
        id={id}
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChange(f);
        }}
      />
      <label
        htmlFor={id}
        className="cursor-pointer group relative flex items-center justify-center h-36 rounded-2xl border-2 border-dashed border-white/15 hover:border-blue-500/50 hover:bg-white/5 transition-all duration-300 overflow-hidden bg-white/3"
      >
        {preview ? (
          <>
            <Image
              src={preview}
              alt={label}
              fill
              className="object-cover rounded-2xl"
            />
            {/* hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex flex-col items-center justify-center gap-1 rounded-2xl">
              <FiUpload
                className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                size={20}
              />
              <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                Thay ảnh
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-600 group-hover:text-blue-400 transition-colors">
            <FiUpload size={22} />
            <span className="text-xs font-medium">{label}</span>
          </div>
        )}
      </label>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ */
export default function AddVendorProduct() {
  const router = useRouter();

  /* ── State ── */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stock, setStock] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isWearable, setIsWearable] = useState(false);
  const [sizeStock, setSizeStock] = useState<{ size: string; stock: number }[]>([]);
  const [replacementDays, setReplacementDays] = useState("");
  const [warranty, setWarranty] = useState("");
  const [freeDelivery, setFreeDelivery] = useState(false);
  const [payOnDelivery, setPayOnDelivery] = useState(false);
  const [weight, setWeight] = useState("500");
  const [length, setLength] = useState("20");
  const [width, setWidth] = useState("15");
  const [height, setHeight] = useState("10");
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
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  /* ── Handlers ── */
  const toggleSize = (size: string) =>
    setSizeStock((prev) =>
      prev.find((s) => s.size === size)
        ? prev.filter((s) => s.size !== size)
        : [...prev, { size, stock: 0 }],
    );

  const updateSizeStock = (size: string, qty: number) =>
    setSizeStock((prev) =>
      prev.map((s) => (s.size === size ? { ...s, stock: Math.max(0, qty) } : s)),
    );

  const handleAddPoint = () => {
    if (!currentPoint.trim()) return;
    setDetailPoints((prev) => [...prev, currentPoint.trim()]);
    setCurrentPoint("");
  };

  const handleSubmit = async () => {
    const isStockValid = isWearable
      ? sizeStock.length > 0 && sizeStock.some((s) => s.stock > 0)
      : !!stock;

    if (!title || !description || !isStockValid || !price || !category || !image1 || !image2 || !image3 || !image4) {
      setToast({
        message: isWearable
          ? "Vui lòng điền đầy đủ thông tin, chọn ít nhất 1 size có tồn kho > 0 và tải lên 4 ảnh."
          : "Vui lòng điền đầy đủ thông tin và tải lên đủ 4 ảnh sản phẩm.",
        type: "error",
      });
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    formData.append("price", price);
    formData.append("stock", isWearable ? "0" : stock);
    formData.append("category", category === "Khác" ? customCategory : category);
    formData.append("isWearable", String(isWearable));
    if (isWearable) formData.append("sizeStock", JSON.stringify(sizeStock));
    formData.append("replacementDays", replacementDays);
    formData.append("weight", weight);
    formData.append("length", length);
    formData.append("width", width);
    formData.append("height", height);
    formData.append("freeDelivery", String(freeDelivery));
    formData.append("warranty", warranty);
    formData.append("payOnDelivery", String(payOnDelivery));
    detailPoints.forEach((p) => formData.append("detailPoints", p));
    formData.append("image1", image1);
    formData.append("image2", image2!);
    formData.append("image3", image3!);
    formData.append("image4", image4!);

    try {
      await axios.post("/api/vendor/addProduct", formData);
      setLoading(false);
      setToast({
        message: "Đăng sản phẩm thành công! Đang chờ admin phê duyệt.",
        type: "success",
      });
      setTimeout(() => router.push("/"), 1800);
    } catch (error) {
      setLoading(false);
      console.error("Add Product Error:", error);
      setToast({ message: "Đăng sản phẩm thất bại. Vui lòng thử lại.", type: "error" });
    }
  };

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Sticky Top Bar ── */}
      <div className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur-md border-b border-white/8">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => router.back()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 text-sm font-medium transition-colors"
          >
            <FiArrowLeft size={15} />
            Quay lại
          </motion.button>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MdStorefront size={18} className="text-blue-400 shrink-0" />
            <span className="font-bold text-white truncate">Thêm sản phẩm mới</span>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-16 space-y-5">

        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2"
        >
          <h1 className="text-2xl sm:text-3xl font-black text-white">
            Đăng sản phẩm
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Điền đầy đủ thông tin để niêm yết sản phẩm của bạn
          </p>
        </motion.div>

        {/* ══ 1. Thông tin cơ bản ══ */}
        <SectionCard number={1} icon={FaTag} title="Thông tin cơ bản">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FieldLabel>Tên sản phẩm *</FieldLabel>
              <input
                className={inputCls}
                placeholder="VD: Áo thun cotton unisex form rộng"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Giá bán (₫) *</FieldLabel>
              <input
                className={inputCls}
                type="number"
                placeholder="VD: 150000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Danh mục *</FieldLabel>
              <select
                className={inputCls + " cursor-pointer appearance-none"}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="" className="bg-gray-800">-- Chọn danh mục --</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-gray-800">{c}</option>
                ))}
              </select>
            </div>

            {/* Custom category */}
            <AnimatePresence>
              {category === "Khác" && (
                <motion.div
                  className="sm:col-span-2"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <FieldLabel>Danh mục tùy chỉnh *</FieldLabel>
                  <input
                    className={inputCls}
                    placeholder="Nhập tên danh mục"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="sm:col-span-2">
              <FieldLabel>Mô tả sản phẩm *</FieldLabel>
              <textarea
                className={inputCls + " resize-none"}
                rows={4}
                placeholder="Mô tả chi tiết về sản phẩm, chất liệu, công dụng..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </SectionCard>

        {/* ══ 2. Phân loại & Tồn kho ══ */}
        <SectionCard number={2} icon={FaCubes} title="Phân loại & Tồn kho">
          {/* Wearable toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none mb-5 w-fit">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isWearable}
                onChange={() => setIsWearable((v) => !v)}
              />
              <div className="w-6 h-6 bg-white/10 border border-white/20 rounded-lg peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all duration-300" />
              <FiCheck className="absolute top-1 left-1 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-300" />
            </div>
            <span className="text-sm font-medium text-gray-200">
              Đây là sản phẩm thời trang / quần áo (có phân loại size)
            </span>
          </label>

          <AnimatePresence mode="wait">
            {!isWearable ? (
              /* Tồn kho đơn giản */
              <motion.div
                key="simple-stock"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <FieldLabel>Số lượng tồn kho *</FieldLabel>
                <input
                  className={inputCls + " max-w-xs"}
                  type="number"
                  placeholder="VD: 100"
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                />
              </motion.div>
            ) : (
              /* Tồn kho theo size */
              <motion.div
                key="size-stock"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-xs text-gray-400 mb-3">
                  Chọn size rồi nhập số lượng tương ứng
                </p>
                <div className="space-y-3">
                  {SIZE_OPTIONS.map((size) => {
                    const entry = sizeStock.find((s) => s.size === size);
                    const isSelected = !!entry;
                    return (
                      <div key={size} className="flex items-center gap-3">
                        <motion.button
                          whileHover={{ scale: 1.06 }}
                          whileTap={{ scale: 0.94 }}
                          type="button"
                          onClick={() => toggleSize(size)}
                          className={`w-14 py-2 rounded-xl text-sm font-bold border-2 transition-all duration-200 ${
                            isSelected
                              ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30"
                              : "bg-white/5 border-white/15 text-gray-400 hover:border-white/30"
                          }`}
                        >
                          {size}
                        </motion.button>

                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: "auto" }}
                              exit={{ opacity: 0, width: 0 }}
                              className="flex items-center gap-2 overflow-hidden"
                            >
                              <input
                                type="number"
                                min={0}
                                value={entry!.stock}
                                onChange={(e) => updateSizeStock(size, Number(e.target.value))}
                                className="w-28 px-3 py-2 bg-white/5 border border-blue-500/40 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 transition-all"
                                placeholder="Số lượng"
                              />
                              <span className="text-xs text-gray-500 whitespace-nowrap">sản phẩm</span>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>

                {sizeStock.length > 0 && (
                  <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/25 rounded-full">
                    <span className="text-xs text-gray-400">Tổng tồn kho:</span>
                    <span className="text-sm font-bold text-blue-400">
                      {sizeStock.reduce((s, i) => s + i.stock, 0)} sản phẩm
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </SectionCard>

        {/* ══ 3. Đặc điểm & Vận chuyển ══ */}
        <SectionCard number={3} icon={FaTruck} title="Đặc điểm & Vận chuyển">
          {/* Bảo hành & đổi trả */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div>
              <FieldLabel>Số ngày đổi trả</FieldLabel>
              <input
                className={inputCls}
                type="text"
                placeholder="VD: 7 ngày"
                value={replacementDays}
                onChange={(e) => setReplacementDays(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Bảo hành</FieldLabel>
              <input
                className={inputCls}
                type="text"
                placeholder="VD: 12 tháng"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
              />
            </div>
          </div>

          {/* GHN dimensions */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-gray-300">📦 Kích thước & khối lượng đóng gói</span>
              <span className="text-xs text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Dùng để tính phí GHN</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Khối lượng (g)", value: weight, setter: setWeight },
                { label: "Dài (cm)", value: length, setter: setLength },
                { label: "Rộng (cm)", value: width, setter: setWidth },
                { label: "Cao (cm)", value: height, setter: setHeight },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <FieldLabel>{label}</FieldLabel>
                  <input
                    type="number"
                    min={1}
                    className={inputCls}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Delivery checkboxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-white/8">
            {[
              {
                label: "Miễn phí giao hàng",
                desc: "Người mua không mất phí ship",
                value: freeDelivery,
                setter: () => setFreeDelivery((v) => !v),
                color: "peer-checked:bg-green-600 peer-checked:border-green-600",
              },
              {
                label: "Thanh toán khi nhận hàng (COD)",
                desc: "Cho phép thanh toán tiền mặt",
                value: payOnDelivery,
                setter: () => setPayOnDelivery((v) => !v),
                color: "peer-checked:bg-purple-600 peer-checked:border-purple-600",
              },
            ].map(({ label, desc, value, setter, color }) => (
              <label key={label} className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-xl hover:bg-white/5 transition-colors">
                <div className="relative shrink-0 mt-0.5">
                  <input type="checkbox" className="sr-only peer" checked={value} onChange={setter} />
                  <div className={`w-6 h-6 bg-white/10 border border-white/20 rounded-lg transition-all duration-300 ${color}`} />
                  <FiCheck className="absolute top-1 left-1 w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-300" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </SectionCard>

        {/* ══ 4. Hình ảnh sản phẩm ══ */}
        <SectionCard number={4} icon={FaImage} title="Hình ảnh sản phẩm">
          <p className="text-xs text-gray-500 mb-4">
            Tải lên 4 ảnh chất lượng cao (JPG, PNG). Ảnh đầu tiên sẽ là ảnh đại diện.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ImageSlot
              id="img1"
              label="Ảnh chính"
              preview={preview1}
              onChange={(f) => { setImage1(f); setPreview1(URL.createObjectURL(f)); }}
            />
            <ImageSlot
              id="img2"
              label="Ảnh 2"
              preview={preview2}
              onChange={(f) => { setImage2(f); setPreview2(URL.createObjectURL(f)); }}
            />
            <ImageSlot
              id="img3"
              label="Ảnh 3"
              preview={preview3}
              onChange={(f) => { setImage3(f); setPreview3(URL.createObjectURL(f)); }}
            />
            <ImageSlot
              id="img4"
              label="Ảnh 4"
              preview={preview4}
              onChange={(f) => { setImage4(f); setPreview4(URL.createObjectURL(f)); }}
            />
          </div>

          {/* Upload progress bar */}
          <div className="mt-4 flex items-center gap-2">
            {[preview1, preview2, preview3, preview4].map((p, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${p ? "bg-blue-500" : "bg-white/10"}`}
              />
            ))}
            <span className="text-xs text-gray-500 shrink-0">
              {[preview1, preview2, preview3, preview4].filter(Boolean).length}/4 ảnh
            </span>
          </div>
        </SectionCard>

        {/* ══ 5. Điểm nổi bật ══ */}
        <SectionCard number={5} icon={FaListUl} title="Điểm nổi bật sản phẩm">
          <p className="text-xs text-gray-500 mb-4">
            Liệt kê các tính năng, ưu điểm nổi bật (Enter để thêm nhanh)
          </p>
          <div className="flex gap-3">
            <input
              className={inputCls + " flex-1"}
              type="text"
              placeholder={`Điểm ${detailPoints.length + 1}: VD: Chất liệu cotton 100%, thoáng mát`}
              value={currentPoint}
              onChange={(e) => setCurrentPoint(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddPoint()}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="button"
              onClick={handleAddPoint}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm transition-colors shrink-0"
            >
              + Thêm
            </motion.button>
          </div>

          <AnimatePresence>
            {detailPoints.length > 0 && (
              <motion.ul
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 space-y-2"
              >
                {detailPoints.map((point, idx) => (
                  <motion.li
                    key={idx}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    className="flex items-center gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl hover:border-white/20 transition-all"
                  >
                    <span className="text-xs font-bold text-blue-400 w-5 shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="text-sm text-gray-200 flex-1">{point}</span>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      type="button"
                      onClick={() => setDetailPoints((p) => p.filter((_, i) => i !== idx))}
                      className="text-gray-600 hover:text-red-400 p-1 rounded-lg transition-colors shrink-0"
                    >
                      <FiX size={16} />
                    </motion.button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </SectionCard>

        {/* ══ Submit ══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.back()}
            className="flex-1 sm:flex-none sm:w-36 py-3.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 font-semibold text-sm transition-colors"
          >
            Hủy bỏ
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(59,130,246,0.35)" }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 font-bold text-base text-white shadow-lg shadow-blue-600/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <ClipLoader size={18} color="white" />
                <span>Đang đăng...</span>
              </>
            ) : (
              <>
                <FaBoxOpen size={16} />
                <span>Đăng sản phẩm</span>
              </>
            )}
          </motion.button>
        </motion.div>

      </div>

      {/* ── Toast ── */}
      <ToastContainer toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
