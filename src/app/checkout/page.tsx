"use client";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaCreditCard,
  FaLock,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaShieldAlt,
  FaTruck,
} from "react-icons/fa";

/* ─── Constants ─── */
const SERVICE_CHARGE = 15_000;
const DELIVERY_FEE_PER_ITEM = 30_000;

/* ─── Types ─── */
interface CartProduct {
  _id: string;
  title: string;
  price: number;
  image1: string;
  freeDelivery?: boolean;
  payOnDelivery?: boolean;
  vendor?: { shopName?: string; name?: string };
}
interface CartItem {
  product: CartProduct;
  quantity: number;
}

/* ────────────────────────────────────────────────────────── */
export default function CheckoutPage() {
  const router = useRouter();

  /* ── State ── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* Form */
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [pinCode, setPinCode] = useState("");

  /* Payment */
  type PayMethod = "cod" | "stripe";
  const [payMethod, setPayMethod] = useState<PayMethod>("cod");
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");

  /* ── Fetch cart ── */
  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/cart");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      const items: CartItem[] = data.cart ?? [];
      setCart(items);

      // Kiểm tra COD: nếu có sản phẩm không cho COD → bắt buộc Stripe
      const codAllowed = items.every((i) => i.product.payOnDelivery !== false);
      if (!codAllowed) setPayMethod("stripe");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // Pre-fill từ profile
  useEffect(() => {
    fetch("/api/user/currentUser")
      .then((r) => r.json())
      .then((data) => {
        if (data?.user?.name) setFullName(data.user.name);
        if (data?.user?.phone) setPhone(data.user.phone);
      })
      .catch(() => {});
  }, []);

  /* ── Billing calc ── */
  const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);

  const deliveryFee = cart.reduce((s, i) => {
    // Free delivery? 0 : 30.000đ × số lượng item đó
    return (
      s + (i.product.freeDelivery ? 0 : DELIVERY_FEE_PER_ITEM * i.quantity)
    );
  }, 0);

  const grandTotal = subtotal + deliveryFee + SERVICE_CHARGE;

  /* COD availability */
  const codAllowed = cart.every((i) => i.product.payOnDelivery !== false);

  /* ── Place COD order ── */
  const handlePlaceOrder = async () => {
    if (payMethod !== "cod") return;
    setPlacing(true);
    setOrderError("");
    try {
      const addrPayload = {
        name: fullName,
        phone,
        address,
        city,
        pincode: pinCode,
      };

      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const itemDelivery = item.product.freeDelivery
          ? 0
          : DELIVERY_FEE_PER_ITEM * item.quantity;
        const itemService = i === 0 ? SERVICE_CHARGE : 0;
        const itemTotal =
          item.product.price * item.quantity + itemDelivery + itemService;

        const res = await fetch("/api/orders/cod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: item.product._id,
            quantity: item.quantity,
            address: addrPayload,
            amount: itemTotal,
            deliveryCharge: itemDelivery,
            serviceCharge: itemService,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message ?? "Có lỗi xảy ra khi đặt hàng");
        }
      }

      router.push("/orders");
    } catch (err: unknown) {
      setOrderError(
        err instanceof Error ? err.message : "Đặt hàng thất bại, vui lòng thử lại",
      );
      setPlacing(false);
    }
  };

  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);

  /* ────────────────── LOADING ────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Đang tải đơn hàng...</p>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    router.push("/cart");
    return null;
  }

  /* ────────────────── MAIN ────────────────── */
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
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
          Quay lại giỏ hàng
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="w-1 h-7 bg-blue-500 rounded-full" />
          <h1 className="text-2xl sm:text-3xl font-bold">Thanh toán</h1>
          <span className="ml-1 text-xs text-gray-500">
            {totalItems} sản phẩm
          </span>
        </motion.div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-24 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ═══════════ LEFT — Form + Payment ═══════════ */}
        <div className="lg:col-span-3 space-y-5">
          {/* ── I. Địa chỉ giao hàng ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <h2 className="text-base font-bold mb-5 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </span>
              <FaMapMarkerAlt className="text-blue-400" size={14} />
              Địa chỉ giao hàng
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Họ và tên <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              {/* Phone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Số điện thoại <span className="text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912 345 678"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              {/* Address — full width */}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Địa chỉ chi tiết <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Số nhà, tên đường, phường/xã, quận/huyện..."
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              {/* City */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Thành phố <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Hà Nội"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>

              {/* Pin Code */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Mã bưu điện <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  placeholder="100000"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>
          </motion.div>

          {/* ── IV. Phương thức thanh toán ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <h2 className="text-base font-bold mb-5 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                2
              </span>
              <FaCreditCard className="text-blue-400" size={14} />
              Phương thức thanh toán
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* COD */}
              <motion.button
                whileTap={codAllowed ? { scale: 0.97 } : {}}
                onClick={() => codAllowed && setPayMethod("cod")}
                disabled={!codAllowed}
                className={`relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left
                  ${
                    !codAllowed
                      ? "border-white/5 bg-white/2 opacity-40 cursor-not-allowed"
                      : payMethod === "cod"
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-white/10 bg-white/3 hover:border-white/25 cursor-pointer"
                  }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    payMethod === "cod" && codAllowed
                      ? "bg-blue-600"
                      : "bg-white/10"
                  }`}
                >
                  <FaMoneyBillWave
                    size={18}
                    className={
                      payMethod === "cod" && codAllowed
                        ? "text-white"
                        : "text-gray-400"
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Cash on Delivery</p>
                  <p className="text-xs text-gray-500">
                    Thanh toán khi nhận hàng
                  </p>
                  {!codAllowed && (
                    <p className="text-[10px] text-red-400 mt-0.5">
                      Người bán không hỗ trợ COD
                    </p>
                  )}
                </div>
                {payMethod === "cod" && codAllowed && (
                  <FaCheckCircle
                    size={16}
                    className="text-blue-400 absolute top-3 right-3"
                  />
                )}
              </motion.button>

              {/* Stripe */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setPayMethod("stripe")}
                className={`relative flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left cursor-pointer
                  ${
                    payMethod === "stripe"
                      ? "border-purple-500 bg-purple-500/10"
                      : "border-white/10 bg-white/3 hover:border-white/25"
                  }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    payMethod === "stripe" ? "bg-purple-600" : "bg-white/10"
                  }`}
                >
                  <FaLock
                    size={16}
                    className={
                      payMethod === "stripe" ? "text-white" : "text-gray-400"
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    Stripe
                    <span className="text-[9px] bg-purple-600/40 text-purple-300 px-1.5 py-0.5 rounded-full border border-purple-500/30">
                      SECURE
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Thẻ quốc tế / Internet Banking
                  </p>
                </div>
                {payMethod === "stripe" && (
                  <FaCheckCircle
                    size={16}
                    className="text-purple-400 absolute top-3 right-3"
                  />
                )}
              </motion.button>
            </div>

            {/* Security note */}
            <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
              <FaShieldAlt size={11} className="text-green-500 shrink-0" />
              Thông tin thanh toán được mã hóa và bảo mật SSL
            </div>
          </motion.div>
        </div>

        {/* ═══════════ RIGHT — Order Summary + Bill ═══════════ */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="lg:col-span-2 space-y-5"
        >
          {/* ── II. Tóm tắt đơn hàng ── */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
              Tóm tắt đơn hàng ({totalItems} sản phẩm)
            </h2>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {cart.map((item) => (
                <div key={item.product._id} className="flex items-center gap-3">
                  {/* Image */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-900 border border-white/10 shrink-0">
                    <img
                      src={item.product.image1}
                      alt={item.product.title}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                      {item.product.title}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Số lượng:{" "}
                      <span className="text-gray-300 font-medium">
                        {item.quantity}
                      </span>
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {item.product.freeDelivery && (
                        <span className="flex items-center gap-0.5 text-[9px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full border border-green-500/20">
                          <FaTruck size={8} /> Free ship
                        </span>
                      )}
                      {item.product.payOnDelivery === false && (
                        <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full border border-red-500/20">
                          No COD
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Line total */}
                  <p className="text-xs font-bold text-blue-400 shrink-0">
                    {(item.product.price * item.quantity).toLocaleString(
                      "vi-VN",
                    )}
                    ₫
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── III. Tính toán hóa đơn ── */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold mb-1 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
              Chi tiết thanh toán
            </h2>

            {/* Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Tiền hàng</span>
              <span className="text-white font-medium">
                {subtotal.toLocaleString("vi-VN")}₫
              </span>
            </div>

            {/* Delivery fee breakdown */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 flex items-center gap-1">
                <FaTruck size={11} className="text-gray-500" />
                Phí giao hàng
              </span>
              {deliveryFee === 0 ? (
                <span className="text-green-400 font-medium">Miễn phí</span>
              ) : (
                <span className="text-white font-medium">
                  {deliveryFee.toLocaleString("vi-VN")}₫
                </span>
              )}
            </div>

            {/* Per-product delivery detail */}
            {cart.some((i) => !i.product.freeDelivery) && (
              <div className="pl-4 space-y-1">
                {cart
                  .filter((i) => !i.product.freeDelivery)
                  .map((i) => (
                    <div
                      key={i.product._id}
                      className="flex justify-between text-[11px] text-gray-600"
                    >
                      <span className="truncate max-w-[60%]">
                        {i.product.title}
                      </span>
                      <span>
                        {(DELIVERY_FEE_PER_ITEM * i.quantity).toLocaleString(
                          "vi-VN",
                        )}
                        ₫
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* Service charge */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Phí dịch vụ</span>
              <span className="text-white font-medium">
                {SERVICE_CHARGE.toLocaleString("vi-VN")}₫
              </span>
            </div>

            <div className="h-px bg-white/10" />

            {/* Grand total */}
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">Tổng cộng</span>
              <span className="text-xl font-black text-blue-400">
                {grandTotal.toLocaleString("vi-VN")}₫
              </span>
            </div>

            {/* Payment method badge */}
            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium border ${
                payMethod === "cod"
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  : "bg-purple-500/10 border-purple-500/30 text-purple-400"
              }`}
            >
              {payMethod === "cod" ? (
                <>
                  <FaMoneyBillWave size={12} />
                  Thanh toán khi nhận hàng (COD)
                </>
              ) : (
                <>
                  <FaLock size={11} />
                  Thanh toán qua Stripe
                </>
              )}
            </div>

            {/* ── V. Nút đặt hàng ── */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              disabled={
                placing ||
                !fullName.trim() ||
                !phone.trim() ||
                !address.trim() ||
                !city.trim() ||
                !pinCode.trim()
              }
              onClick={handlePlaceOrder}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 ${
                placing ||
                !fullName.trim() ||
                !phone.trim() ||
                !address.trim() ||
                !city.trim() ||
                !pinCode.trim()
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : payMethod === "cod"
                    ? "bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg hover:shadow-blue-500/40"
                    : "bg-linear-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg hover:shadow-purple-500/40"
              }`}
            >
              {placing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang xử lý...
                </>
              ) : payMethod === "cod" ? (
                <>
                  <FaTruck size={14} />
                  Place Order
                </>
              ) : (
                <>
                  <FaLock size={13} />
                  Proceed to Secure Payment
                </>
              )}
            </motion.button>

            {/* Order error */}
            {orderError && (
              <p className="text-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {orderError}
              </p>
            )}

            {/* Form validation hint */}
            {(!fullName.trim() ||
              !phone.trim() ||
              !address.trim() ||
              !city.trim() ||
              !pinCode.trim()) && (
              <p className="text-center text-[11px] text-gray-600">
                Vui lòng điền đầy đủ thông tin địa chỉ giao hàng
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
