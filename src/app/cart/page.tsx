"use client";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaArrowLeft, FaShoppingCart, FaTrash } from "react-icons/fa";
import AddressPickerModal from "@/app/component/AddressPickerModal";
import type { Address } from "@/app/component/AddressBook";

interface CartItem {
  product: {
    _id: string;
    title: string;
    price: number;
    image1: string;
    stock: number;
    isStockAvailable: boolean;
    isWearable?: boolean;
    sizeStock?: { size: string; stock: number }[];
    vendor?: { shopName?: string; name?: string };
  };
  quantity: number;
  size?: string;
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [addrLoading, setAddrLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [ghnFee, setGhnFee] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const feeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/cart");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setCart(data.cart ?? []);
    } catch {
      setCart([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // Load saved addresses, preselect the default one.
  useEffect(() => {
    fetch("/api/user/addresses")
      .then((r) => r.json())
      .then((d) => {
        const list: Address[] = d.addresses ?? [];
        setSelectedAddress(
          list.find((a) => a.isDefault) ?? list[0] ?? null,
        );
      })
      .catch(() => {})
      .finally(() => setAddrLoading(false));
  }, []);

  // Recalculate GHN fee whenever the address or cart contents change (debounced).
  useEffect(() => {
    if (!selectedAddress || cart.length === 0) {
      setGhnFee(null);
      return;
    }
    if (feeTimer.current) clearTimeout(feeTimer.current);
    setFeeLoading(true);
    setFeeError(null);
    feeTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/ghn/calculate-fee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addressId: selectedAddress._id,
            items: cart.map((c) => ({
              productId: c.product._id,
              quantity: c.quantity,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message ?? "Không tính được phí ship");
        setGhnFee(data.totalFee);
        // Stash for checkout to reuse without recomputing.
        sessionStorage.setItem(
          "ghnCheckout",
          JSON.stringify({
            addressId: selectedAddress._id,
            totalFee: data.totalFee,
            feesByVendor: data.feesByVendor,
          }),
        );
      } catch (e: any) {
        setGhnFee(null);
        setFeeError(e?.message ?? "Lỗi tính phí vận chuyển");
      } finally {
        setFeeLoading(false);
      }
    }, 500);
    return () => {
      if (feeTimer.current) clearTimeout(feeTimer.current);
    };
  }, [selectedAddress, cart]);

  /* ── Tăng / Giảm số lượng ── */
  const handleQty = async (productId: string, newQty: number, size?: string) => {
    if (newQty < 1) return;
    const key = size ? `${productId}__${size}` : productId;
    setUpdatingId(key);
    try {
      const url = `/api/user/cart/${productId}${size ? `?size=${encodeURIComponent(size)}` : ""}`;
      await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: newQty }),
      });
      setCart((prev) =>
        prev.map((item) =>
          item.product._id === productId && (item.size ?? null) === (size ?? null)
            ? { ...item, quantity: newQty }
            : item,
        ),
      );
    } finally {
      setUpdatingId(null);
    }
  };

  /* ── Xóa sản phẩm ── */
  const handleDelete = async (productId: string, size?: string) => {
    const key = size ? `${productId}__${size}` : productId;
    setDeletingId(key);
    try {
      const url = `/api/user/cart/${productId}${size ? `?size=${encodeURIComponent(size)}` : ""}`;
      await fetch(url, { method: "DELETE" });
      setCart((prev) =>
        prev.filter(
          (item) =>
            !(item.product._id === productId && (item.size ?? null) === (size ?? null)),
        ),
      );
    } finally {
      setDeletingId(null);
    }
  };

  /* ── Tính tổng ── */
  const subtotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  /* ─────────────────────────── LOADING ─────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Đang tải giỏ hàng...</p>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── EMPTY ─────────────────────────── */
  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-5 text-center px-4">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"
        >
          <FaShoppingCart size={36} className="text-gray-600" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="text-xl font-bold text-white mb-1">Giỏ hàng trống</h2>
          <p className="text-gray-500 text-sm mb-5">
            Bạn chưa thêm sản phẩm nào vào giỏ hàng
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors duration-200"
          >
            <FaArrowLeft size={12} />
            Tiếp tục mua sắm
          </Link>
        </motion.div>
      </div>
    );
  }

  /* ─────────────────────────── MAIN ─────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors group mb-6"
        >
          <FaArrowLeft
            size={13}
            className="group-hover:-translate-x-1 transition-transform duration-200"
          />
          Tiếp tục mua sắm
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="w-1 h-7 bg-blue-500 rounded-full" />
          <h1 className="text-2xl sm:text-3xl font-bold">Giỏ hàng của bạn</h1>
          <span className="ml-1 bg-blue-600/30 text-blue-400 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-500/30">
            {totalItems} sản phẩm
          </span>
        </motion.div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-24 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Cart Items List ── */}
        <div className="lg:col-span-2 space-y-3">
          <AnimatePresence initial={false}>
            {cart.map((item, idx) => {
              const pid = item.product._id;
              const cartKey = item.size ? `${pid}__${item.size}` : pid;
              const lineTotal = item.product.price * item.quantity;
              const isUpdating = updatingId === cartKey;
              const isDeleting = deletingId === cartKey;
              // Stock tối đa theo size hoặc tổng
              const maxStock =
                item.size && item.product.sizeStock
                  ? (item.product.sizeStock.find((s) => s.size === item.size)?.stock ?? 99)
                  : (item.product.stock ?? 99);

              return (
                <motion.div
                  key={pid}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -60, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: idx * 0.04 }}
                  className={`relative bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4 transition-opacity duration-200 ${
                    isDeleting ? "opacity-40 pointer-events-none" : ""
                  }`}
                >
                  {/* Product Image */}
                  <Link href={`/product/${pid}`} className="shrink-0">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-900 border border-white/10">
                      <img
                        src={item.product.image1}
                        alt={item.product.title}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        draggable={false}
                      />
                    </div>
                  </Link>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link href={`/product/${pid}`}>
                      <h3 className="text-sm font-semibold text-white hover:text-blue-300 transition-colors line-clamp-2 leading-snug mb-1">
                        {item.product.title}
                      </h3>
                    </Link>

                    {item.product.vendor && (
                      <p className="text-[11px] text-gray-500 mb-1">
                        Sold by{" "}
                        <span className="text-gray-400">
                          {item.product.vendor.shopName ||
                            item.product.vendor.name ||
                            "Vendor"}
                        </span>
                      </p>
                    )}

                    {/* Size badge */}
                    {item.size && (
                      <span className="inline-block bg-blue-500/15 text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-500/30 mb-2">
                        Size: {item.size}
                      </span>
                    )}

                    {/* Price per unit */}
                    <p className="text-xs text-gray-400 mb-3">
                      Đơn giá:{" "}
                      <span className="text-blue-400 font-semibold">
                        {item.product.price.toLocaleString("vi-VN")}₫
                      </span>
                    </p>

                    {/* Qty controls + line total */}
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      {/* Quantity */}
                      <div className="flex items-center border border-white/20 rounded-xl overflow-hidden">
                        <button
                          onClick={() => handleQty(pid, item.quantity - 1, item.size)}
                          disabled={isUpdating || item.quantity <= 1}
                          className="px-3 py-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-base font-bold disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="px-3 py-1 text-white font-bold text-sm min-w-8 text-center">
                          {isUpdating ? (
                            <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            item.quantity
                          )}
                        </span>
                        <button
                          onClick={() => handleQty(pid, item.quantity + 1, item.size)}
                          disabled={isUpdating || item.quantity >= maxStock}
                          className="px-3 py-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors text-base font-bold disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>

                      {/* Line total */}
                      <p className="text-blue-400 font-bold text-sm">
                        {lineTotal.toLocaleString("vi-VN")}₫
                      </p>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(pid, item.size)}
                    disabled={isDeleting}
                    className="absolute top-3 right-3 p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-200 disabled:opacity-40"
                    aria-label="Xóa sản phẩm"
                  >
                    <FaTrash size={12} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* ── Order Summary ── */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:col-span-1"
        >
          <div className="sticky top-6 bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
              Tổng đơn hàng
            </h2>

            {/* Item breakdown */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div
                  key={`${item.product._id}${item.size ? `_${item.size}` : ""}`}
                  className="flex justify-between text-xs text-gray-400 gap-2"
                >
                  <span className="truncate flex-1">
                    {item.product.title}
                    {item.size && (
                      <span className="ml-1 text-blue-400/70">[{item.size}]</span>
                    )}{" "}
                    <span className="text-gray-600">×{item.quantity}</span>
                  </span>
                  <span className="text-white font-medium shrink-0">
                    {(item.product.price * item.quantity).toLocaleString(
                      "vi-VN",
                    )}
                    ₫
                  </span>
                </div>
              ))}
            </div>

            <div className="h-px bg-white/10" />

            {/* Delivery address */}
            {addrLoading ? (
              <p className="text-xs text-gray-500">Đang tải địa chỉ...</p>
            ) : selectedAddress ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 uppercase font-semibold">
                    Giao đến
                  </span>
                  <button
                    onClick={() => setShowPicker(true)}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    Đổi
                  </button>
                </div>
                <p className="text-xs text-white font-medium">
                  {selectedAddress.fullName} | {selectedAddress.phone}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {selectedAddress.addressDetail}, {selectedAddress.wardName},{" "}
                  {selectedAddress.districtName}, {selectedAddress.provinceName}
                </p>
              </div>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                <p className="text-xs text-amber-300 mb-2">
                  ⚠️ Bạn chưa có địa chỉ giao hàng
                </p>
                <Link
                  href="/profile"
                  className="text-xs text-blue-400 hover:underline font-semibold"
                >
                  + Thêm địa chỉ trong Hồ sơ
                </Link>
              </div>
            )}

            {/* Subtotal */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">
                Tạm tính ({totalItems} sản phẩm)
              </span>
              <span className="text-white font-semibold text-sm">
                {subtotal.toLocaleString("vi-VN")}₫
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Phí vận chuyển</span>
              {feeLoading ? (
                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : ghnFee !== null ? (
                <span className="text-white text-sm font-semibold">
                  {ghnFee.toLocaleString("vi-VN")}₫
                </span>
              ) : (
                <span className="text-gray-500 text-xs">
                  {selectedAddress ? "—" : "Chọn địa chỉ"}
                </span>
              )}
            </div>
            {feeError && (
              <p className="text-[11px] text-red-400">{feeError}</p>
            )}

            <div className="h-px bg-white/10" />

            {/* Grand total */}
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">Tổng cộng</span>
              <span className="text-xl font-black text-blue-400">
                {(subtotal + (ghnFee ?? 0)).toLocaleString("vi-VN")}₫
              </span>
            </div>

            {/* Checkout button */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              disabled={
                checkingOut ||
                !selectedAddress ||
                feeLoading ||
                ghnFee === null
              }
              onClick={() => {
                setCheckingOut(true);
                router.push("/checkout");
              }}
              className="w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg hover:shadow-blue-500/30 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {checkingOut ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang xử lý...
                </span>
              ) : !selectedAddress ? (
                "Cần địa chỉ giao hàng"
              ) : feeLoading ? (
                "Đang tính phí ship..."
              ) : (
                "Thanh toán →"
              )}
            </motion.button>

            {/* Continue shopping */}
            <Link
              href="/"
              className="block text-center text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1"
            >
              Tiếp tục mua sắm
            </Link>
          </div>
        </motion.div>
      </div>

      <AddressPickerModal
        open={showPicker}
        selectedId={selectedAddress?._id}
        onClose={() => setShowPicker(false)}
        onPick={(a) => setSelectedAddress(a)}
      />
    </div>
  );
}
