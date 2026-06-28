"use client";
import { motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCheckCircle,
  FaCreditCard,
  FaMapMarkerAlt,
  FaMoneyBillWave,
  FaShieldAlt,
  FaTicketAlt,
  FaTruck,
} from "react-icons/fa";
import AddressPickerModal from "@/app/component/AddressPickerModal";
import type { Address } from "@/app/component/AddressBook";
import VoucherPicker, { VoucherSelection } from "@/app/component/VoucherPicker";
import type { VoucherCandidate } from "@/lib/voucher/candidateTypes";
import {
  clearPreferredVoucher,
  readPreferredVoucher,
} from "@/lib/voucher/preferredVoucher";

const SERVICE_CHARGE = 15_000;

// Dịch lý do voucher bị từ chối (server trả mã tiếng Anh) sang tiếng Việt.
const REJECT_REASON_LABEL: Record<string, string> = {
  not_collected: "Voucher chưa được lưu",
  expired: "Voucher đã hết hạn",
  inactive: "Voucher ngừng hoạt động",
  quota_exhausted: "Voucher đã hết lượt",
  wrong_slot: "Sai loại voucher",
  wrong_vendor: "Không áp dụng cho shop trong giỏ",
  min_spend: "Chưa đạt giá trị tối thiểu",
  not_applicable: "Không áp dụng cho sản phẩm trong giỏ",
  duplicate_slot: "Trùng loại voucher",
};

interface CartProduct {
  _id: string;
  title: string;
  price: number;
  image1: string;
  freeDelivery?: boolean;
  payOnDelivery?: boolean;
  vendor?: { _id?: string; shopName?: string; name?: string };
}
interface CartItem {
  product: CartProduct;
  quantity: number;
  size?: string;
}
interface VendorFee {
  vendorId: string;
  fee: number;
  serviceId: number;
  isFreeDelivery?: boolean;
}
interface QuoteState {
  finalPayable: number;
  totalShopDiscount: number;
  platformDiscount: number;
  freeshipDiscount: number;
  shippingFeeTotal: number;
  serviceCharge: number;
  rejected: { code: string; reason: string }[];
}

export default function CheckoutPage() {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [feesByVendor, setFeesByVendor] = useState<VendorFee[]>([]);
  const [shipFee, setShipFee] = useState<number | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  type PayMethod = "cod" | "vnpay";
  const [payMethod, setPayMethod] = useState<PayMethod>("cod");
  const [placing, setPlacing] = useState(false);
  const [orderError, setOrderError] = useState("");
  // Idempotency key cho cả lượt checkout này: giữ nguyên qua mọi lần submit để
  // double-click / retry không tạo đơn trùng (server trả lại batch cũ).
  const [checkoutRequestId] = useState(() => crypto.randomUUID());
  const [voucherSelection, setVoucherSelection] = useState<VoucherSelection>({
    shopVoucherCodes: [],
    platformVoucherCode: "",
    freeshipVoucherCode: "",
  });
  const [userTouchedVoucher, setUserTouchedVoucher] = useState(false);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [candidates, setCandidates] = useState<VoucherCandidate[]>([]);
  const [candidateContextKey, setCandidateContextKey] = useState("");

  // Lưu voucher vào ví ngay tại checkout ("Lưu & chọn"). Trả true nếu đã có thể dùng.
  const handleCollectVoucher = useCallback(async (voucherId: string) => {
    try {
      const res = await fetch("/api/user/vouchers/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherId }),
      });
      if (res.ok) return true;
      const data = await res.json().catch(() => ({}));
      // Đã nằm trong ví ở trạng thái collected -> vẫn dùng được.
      return res.status === 409 && data?.status === "collected";
    } catch {
      return false;
    }
  }, []);

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
      const codAllowed = items.every((i) => i.product.payOnDelivery !== false);
      if (!codAllowed) setPayMethod("vnpay");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // Recompute fee for an address (also used when switching address at checkout).
  const computeFee = useCallback(
    async (addressId: string, items: CartItem[]) => {
      setFeeLoading(true);
      try {
        const res = await fetch("/api/ghn/calculate-fee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addressId,
            items: items.map((c) => ({
              productId: c.product._id,
              quantity: c.quantity,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        setShipFee(data.totalFee);
        setFeesByVendor(data.feesByVendor ?? []);
      } catch {
        setShipFee(null);
      } finally {
        setFeeLoading(false);
      }
    },
    [],
  );

  // Prefer the fee already computed on the cart page (sessionStorage),
  // otherwise fall back to the default address + a fresh computation.
  useEffect(() => {
    if (cart.length === 0) return;
    const stash = sessionStorage.getItem("ghnCheckout");
    let stashedAddressId: string | null = null;
    if (stash) {
      try {
        const p = JSON.parse(stash);
        stashedAddressId = p.addressId;
        setShipFee(p.totalFee);
        setFeesByVendor(p.feesByVendor ?? []);
      } catch {
        /* ignore */
      }
    }
    fetch("/api/user/addresses")
      .then((r) => r.json())
      .then((d) => {
        const list: Address[] = d.addresses ?? [];
        const picked =
          list.find((a) => a._id === stashedAddressId) ??
          list.find((a) => a.isDefault) ??
          list[0] ??
          null;
        setSelectedAddress(picked);
        if (picked && !stashedAddressId) computeFee(picked._id, cart);
      })
      .catch(() => {});
  }, [cart, computeFee]);

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const grandTotal = subtotal + (shipFee ?? 0) + SERVICE_CHARGE;
  const voucherDiscount =
    (quote?.totalShopDiscount ?? 0) +
    (quote?.platformDiscount ?? 0) +
    (quote?.freeshipDiscount ?? 0);
  const payableTotal = quote?.finalPayable ?? grandTotal;
  const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
  const codAllowed = cart.every((i) => i.product.payOnDelivery === true);
  const selectedVoucherCount =
    voucherSelection.shopVoucherCodes.length +
    (voucherSelection.platformVoucherCode ? 1 : 0) +
    (voucherSelection.freeshipVoucherCode ? 1 : 0);

  // Helper: tra cứu vendor nào được miễn phí ship
  const freeVendorIds = new Set(
    feesByVendor.filter((f) => f.isFreeDelivery).map((f) => f.vendorId),
  );
  const allFreeDelivery = feesByVendor.length > 0 && feesByVendor.every((f) => f.isFreeDelivery);
  const someFreeDelivery = feesByVendor.some((f) => f.isFreeDelivery);

  const onPickAddress = (a: Address) => {
    setSelectedAddress(a);
    computeFee(a._id, cart);
  };

  const quoteContextKey =
    selectedAddress && cart.length > 0
      ? `${selectedAddress._id}:${cart
          .map((item) => `${item.product._id}:${item.quantity}:${item.size ?? ""}`)
          .join("|")}`
      : "";

  // Quote + auto-gợi ý voucher gộp 1 effect: tổng tiền luôn khớp selection ngay
  // từ lần đầu (tránh khoảng stale), không spam request lặp vô hạn.
  useEffect(() => {
    if (!selectedAddress || cart.length === 0) {
      setQuote(null);
      setCandidates([]);
      setCandidateContextKey("");
      return;
    }

    const controller = new AbortController();
    const items = cart.map((item) => ({
      productId: item.product._id,
      quantity: item.quantity,
      size: item.size,
    }));
    const hasSelection =
      voucherSelection.shopVoucherCodes.length > 0 ||
      Boolean(voucherSelection.platformVoucherCode) ||
      Boolean(voucherSelection.freeshipVoucherCode);
    const wantRecommend = !userTouchedVoucher && !hasSelection;

    setQuoteLoading(true);
    setCandidateContextKey("");
    fetch("/api/voucher/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        addressId: selectedAddress._id,
        items,
        includeCandidates: true,
        ...(wantRecommend ? { recommend: true } : voucherSelection),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.quote) {
          setQuote(data.quote);
          setShipFee(data.quote.shippingFeeTotal);
        }
        setCandidates(data.candidates ?? []);
        setCandidateContextKey(quoteContextKey);
        if (wantRecommend && data.recommended) {
          const next = {
            shopVoucherCodes: data.recommended.shopVoucherCodes ?? [],
            platformVoucherCode: data.recommended.platformVoucherCode ?? "",
            freeshipVoucherCode: data.recommended.freeshipVoucherCode ?? "",
          };
          const changed =
            next.shopVoucherCodes.join(",") !==
              voucherSelection.shopVoucherCodes.join(",") ||
            next.platformVoucherCode !== voucherSelection.platformVoucherCode ||
            next.freeshipVoucherCode !== voucherSelection.freeshipVoucherCode;
          if (changed) setVoucherSelection(next);
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setQuote(null);
          setCandidates([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteLoading(false);
      });

    return () => controller.abort();
  }, [cart, quoteContextKey, selectedAddress, voucherSelection, userTouchedVoucher]);

  useEffect(() => {
    if (!loading && cart.length === 0) {
      router.push("/cart");
    }
  }, [cart.length, loading, router]);

  // "Dùng ngay" từ hub: đọc preference MỘT lần sau khi có candidates. Nếu voucher
  // còn dùng được thì tự chọn đúng slot; nếu không thì xóa preference + báo ngắn.
  const preferenceHandledRef = useRef(false);
  useEffect(() => {
    if (
      preferenceHandledRef.current ||
      !quoteContextKey ||
      candidateContextKey !== quoteContextKey
    ) {
      return;
    }

    const pref = readPreferredVoucher();
    if (!pref?.code) return;

    preferenceHandledRef.current = true;
    clearPreferredVoucher();

    const candidate = candidates.find(
      (c) => c.code === pref.code && (!pref.slot || c.slot === pref.slot),
    );
    if (candidate && candidate.eligible && candidate.collected) {
      setUserTouchedVoucher(true);
      setVoucherSelection((prev) => {
        if (candidate.slot === "shop") {
          const kept = prev.shopVoucherCodes.filter((code) => {
            const match = candidates.find((c) => c.code === code);
            return match?.vendorId !== candidate.vendorId;
          });
          return { ...prev, shopVoucherCodes: [...kept, candidate.code] };
        }
        if (candidate.slot === "platform") {
          return { ...prev, platformVoucherCode: candidate.code };
        }
        return { ...prev, freeshipVoucherCode: candidate.code };
      });
    } else {
      setOrderError("Voucher chưa áp dụng được cho giỏ hàng hiện tại");
    }
  }, [candidateContextKey, candidates, quoteContextKey]);

  const handlePlaceOrder = async () => {
    if (!selectedAddress) return;
    setPlacing(true);
    setOrderError("");

    const items = cart.map((item) => ({
      productId: item.product._id,
      quantity: item.quantity,
      size: item.size,
    }));

    try {
      if (payMethod === "vnpay") {
        const res = await fetch("/api/orders/vnpay/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            addressId: selectedAddress._id,
            clientTotal: payableTotal,
            checkoutRequestId,
            ...voucherSelection,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message ?? "Có lỗi xảy ra khi đặt hàng");
        }
        const { paymentUrl } = await res.json();
        sessionStorage.removeItem("ghnCheckout");
        window.location.href = paymentUrl;
        return;
      }

      const res = await fetch("/api/orders/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          addressId: selectedAddress._id,
          clientTotal: payableTotal,
          checkoutRequestId,
          ...voucherSelection,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? "Có lỗi xảy ra khi đặt hàng");
      }
      sessionStorage.removeItem("ghnCheckout");
      router.push("/orders");
    } catch (err: unknown) {
      setOrderError(
        err instanceof Error
          ? err.message
          : "Đặt hàng thất bại, vui lòng thử lại",
      );
      setPlacing(false);
    }
  };

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
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-2">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors group mb-6"
        >
          <FaArrowLeft size={13} />
          Quay lại giỏ hàng
        </motion.button>

        <div className="flex items-center gap-3 mb-8">
          <div className="w-1 h-7 bg-blue-500 rounded-full" />
          <h1 className="text-2xl sm:text-3xl font-bold">Thanh toán</h1>
          <span className="ml-1 text-xs text-gray-500">
            {totalItems} sản phẩm
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pb-24 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-5">
          {/* Delivery address (read-only card + change) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <h2 className="text-base font-bold mb-5 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                1
              </span>
              <FaMapMarkerAlt className="text-blue-400" size={14} />
              Địa chỉ giao hàng
            </h2>

            {selectedAddress ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold">
                    {selectedAddress.fullName}{" "}
                    <span className="text-gray-400 font-normal">
                      | {selectedAddress.phone}
                    </span>
                  </p>
                  <button
                    onClick={() => setShowPicker(true)}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    Đổi địa chỉ
                  </button>
                </div>
                <p className="text-sm text-gray-300">
                  {selectedAddress.addressDetail}, {selectedAddress.wardName},{" "}
                  {selectedAddress.districtName}, {selectedAddress.provinceName}
                </p>
              </div>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <p className="text-sm text-amber-300 mb-2">
                  Bạn chưa có địa chỉ giao hàng
                </p>
                <button
                  onClick={() => router.push("/profile")}
                  className="text-sm text-blue-400 hover:underline"
                >
                  + Thêm địa chỉ trong Hồ sơ
                </button>
              </div>
            )}
          </motion.div>

          {/* Vouchers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 shadow-lg shadow-emerald-950/20"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold shrink-0">
                  2
                </span>
                <FaTicketAlt className="text-emerald-300" size={14} />
                Ưu đãi & Voucher
              </h2>
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                {selectedVoucherCount > 0
                  ? `${selectedVoucherCount} mã đang chọn`
                  : "Chưa chọn mã"}
              </span>
            </div>
            <VoucherPicker
              selection={voucherSelection}
              candidates={candidates}
              loading={quoteLoading}
              onCollect={handleCollectVoucher}
              onChange={(sel) => {
                setUserTouchedVoucher(true);
                setVoucherSelection(sel);
              }}
            />
            {quoteLoading && (
              <p className="mt-3 text-xs text-gray-400">Đang kiểm tra voucher...</p>
            )}
            {quote?.rejected?.length ? (
              <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {quote.rejected.map((item) => (
                  <p key={`${item.code}-${item.reason}`}>
                    {item.code}: {REJECT_REASON_LABEL[item.reason] ?? item.reason}
                  </p>
                ))}
              </div>
            ) : null}
          </motion.div>

          {/* Payment method */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-6"
          >
            <h2 className="text-base font-bold mb-5 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
                3
              </span>
              <FaCreditCard className="text-blue-400" size={14} />
              Phương thức thanh toán
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* ── COD ── */}
              <motion.button
                whileTap={codAllowed ? { scale: 0.97 } : {}}
                onClick={() => codAllowed && setPayMethod("cod")}
                disabled={!codAllowed}
                className={`relative flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  !codAllowed
                    ? "border-white/8 bg-white/2 opacity-50 cursor-not-allowed"
                    : payMethod === "cod"
                      ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10"
                      : "border-white/10 bg-white/3 hover:border-white/25 cursor-pointer"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    payMethod === "cod" && codAllowed ? "bg-blue-600" : "bg-white/10"
                  }`}
                >
                  <FaMoneyBillWave
                    size={16}
                    className={payMethod === "cod" && codAllowed ? "text-white" : "text-gray-400"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Tiền mặt (COD)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Thanh toán khi nhận hàng</p>
                  {!codAllowed ? (
                    <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      Người bán không hỗ trợ COD
                    </p>
                  ) : (
                    <p className="text-[11px] text-green-400 mt-1.5 flex items-center gap-1">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                      Được hỗ trợ
                    </p>
                  )}
                </div>
                {payMethod === "cod" && codAllowed && (
                  <FaCheckCircle size={15} className="text-blue-400 shrink-0 mt-0.5" />
                )}
              </motion.button>

              {/* ── VNPay ── */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setPayMethod("vnpay")}
                className={`relative flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left cursor-pointer ${
                  payMethod === "vnpay"
                    ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/10"
                    : "border-white/10 bg-white/3 hover:border-white/25"
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 overflow-hidden ${
                    payMethod === "vnpay" ? "bg-red-600" : "bg-white/10"
                  }`}
                >
                  <FaCreditCard
                    size={15}
                    className={payMethod === "vnpay" ? "text-white" : "text-gray-400"}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm flex items-center gap-1.5">
                    VNPay
                    <span className="text-[9px] bg-red-600/40 text-red-300 px-1.5 py-0.5 rounded-full border border-red-500/30 font-bold">
                      SECURE
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Thẻ ATM / QR Code / Internet Banking</p>
                  <p className="text-[11px] text-green-400 mt-1.5 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    Hỗ trợ tất cả ngân hàng VN
                  </p>
                </div>
                {payMethod === "vnpay" && (
                  <FaCheckCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
                )}
              </motion.button>
            </div>

            {/* Note SSL */}
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
              <FaShieldAlt size={11} className="text-green-500 shrink-0" />
              Thông tin thanh toán được mã hóa và bảo mật SSL
            </div>
          </motion.div>
        </div>

        {/* Order summary */}
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-2 space-y-5"
        >
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
              Tóm tắt đơn hàng ({totalItems} sản phẩm)
            </h2>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {cart.map((item) => {
                const isItemFreeShip = freeVendorIds.has(item.product.vendor?._id ?? "");
                return (
                  <div
                    key={`${item.product._id}-${item.size ?? ""}`}
                    className="flex items-center gap-3"
                  >
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-900 border border-white/10 shrink-0">
                      <Image
                        src={item.product.image1}
                        alt={item.product.title}
                        fill
                        sizes="56px"
                        className="object-cover"
                        draggable={false}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                        {item.product.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        {item.size && (
                          <span className="bg-blue-500/15 text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-500/30">
                            Size: {item.size}
                          </span>
                        )}
                        {isItemFreeShip && (
                          <span className="bg-green-500/15 text-green-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-green-500/30 flex items-center gap-1">
                            <FaTruck size={8} />
                            Miễn phí ship
                          </span>
                        )}
                        {item.product.payOnDelivery && (
                          <span className="bg-yellow-500/15 text-yellow-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-yellow-500/30">
                            COD
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        Số lượng:{" "}
                        <span className="text-gray-300 font-medium">
                          {item.quantity}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs font-bold text-blue-400 shrink-0">
                      {(item.product.price * item.quantity).toLocaleString("vi-VN")}₫
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold mb-1 flex items-center gap-2">
              <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
              Chi tiết thanh toán
            </h2>

            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Tiền hàng</span>
              <span className="text-white font-medium">
                {subtotal.toLocaleString("vi-VN")}₫
              </span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-400 flex items-center gap-1.5">
                <FaTruck size={11} className="text-gray-500" />
                Phí giao hàng (GHN)
                {someFreeDelivery && !allFreeDelivery && (
                  <span className="text-[10px] text-green-400 bg-green-500/10 border border-green-500/25 px-1.5 py-0.5 rounded-full font-semibold">
                    1 gian hàng free
                  </span>
                )}
              </span>
              {feeLoading ? (
                <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : allFreeDelivery ? (
                <span className="text-green-400 font-semibold flex items-center gap-1">
                  <FaCheckCircle size={11} />
                  Miễn phí
                </span>
              ) : shipFee !== null ? (
                <span className="text-white font-medium">
                  {shipFee.toLocaleString("vi-VN")}₫
                </span>
              ) : (
                <span className="text-gray-500 text-xs">—</span>
              )}
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Phí dịch vụ</span>
              <span className="text-white font-medium">
                {SERVICE_CHARGE.toLocaleString("vi-VN")}₫
              </span>
            </div>

            {voucherDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-300">Giảm giá</span>
                <span className="font-semibold text-emerald-300">
                  -{voucherDiscount.toLocaleString("vi-VN")}₫
                </span>
              </div>
            )}

            <div className="h-px bg-white/10" />

            <div className="flex justify-between items-center">
              <span className="font-bold text-white">Tổng cộng</span>
              <span className="text-xl font-black text-blue-400">
                {payableTotal.toLocaleString("vi-VN")}₫
              </span>
            </div>

            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium border ${
                payMethod === "cod"
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}
            >
              {payMethod === "cod" ? (
                <>
                  <FaMoneyBillWave size={12} />
                  Thanh toán khi nhận hàng (COD)
                </>
              ) : (
                <>
                  <FaCreditCard size={11} />
                  Thanh toán qua VNPay
                </>
              )}
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.02 }}
              disabled={placing || !selectedAddress || feeLoading || quoteLoading || shipFee === null || (quote?.rejected?.length ?? 0) > 0}
              onClick={handlePlaceOrder}
              className={`w-full py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
                placing || !selectedAddress || feeLoading || quoteLoading || shipFee === null || (quote?.rejected?.length ?? 0) > 0
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                  : payMethod === "vnpay"
                    ? "bg-linear-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-lg hover:shadow-red-500/40"
                    : "bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg hover:shadow-blue-500/40"
              }`}
            >
              {placing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <FaTruck size={14} />
                  {payMethod === "vnpay" ? "Thanh toán qua VNPay" : "Đặt hàng"}
                </>
              )}
            </motion.button>

            {orderError && (
              <p className="text-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {orderError}
              </p>
            )}
          </div>
        </motion.div>
      </div>

      <AddressPickerModal
        open={showPicker}
        selectedId={selectedAddress?._id}
        onClose={() => setShowPicker(false)}
        onPick={onPickAddress}
      />
    </div>
  );
}
