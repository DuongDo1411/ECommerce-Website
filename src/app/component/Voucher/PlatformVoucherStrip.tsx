"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VoucherCard from "@/app/component/VoucherCard";
import { savePreferredVoucher } from "@/lib/voucher/preferredVoucher";
import {
  useCollectVoucher,
  voucherWalletActionLabel,
} from "./useCollectVoucher";
import type { WalletStatus } from "./useCollectVoucher";

type PublicVoucher = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  discountType: "fixed" | "percentage" | "freeship";
  discountValue: number;
  maxDiscount?: number;
  minSpend?: number;
  endAt?: string;
  vendor?: string | null;
  collected?: boolean;
  walletStatus?: WalletStatus;
};

export default function PlatformVoucherStrip() {
  const router = useRouter();
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const { collectVoucher, collectingId, walletStatusById } = useCollectVoucher();

  useEffect(() => {
    fetch("/api/vouchers?slot=platform&limit=6&sort=bestValue")
      .then((res) => res.json())
      .then((data: { vouchers?: PublicVoucher[] }) => setVouchers(data.vouchers ?? []))
      .catch(() => setVouchers([]));
  }, []);

  const visible = vouchers;
  if (visible.length === 0) return null;

  const handleUseNow = (voucher: PublicVoucher) => {
    savePreferredVoucher(voucher);
    router.push("/cart");
  };

  return (
    <section className="w-full max-w-7xl px-4 py-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-300">Ưu đãi hôm nay</p>
          <h2 className="text-xl font-bold text-white">Mã giảm giá nổi bật</h2>
        </div>
        <button
          onClick={() => router.push("/vouchers")}
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-200 hover:border-blue-400"
        >
          Xem tất cả →
        </button>
      </div>
      <div className="mb-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
        Trung tâm Mã giảm giá đã mở. Lưu voucher trước, chọn nhanh khi thanh toán.
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {visible.map((voucher) => {
          const walletStatus =
            voucher.walletStatus ?? walletStatusById.get(voucher._id);
          const collected = walletStatus === "collected";
          const isCollecting = collectingId === voucher._id;
          if (collected) {
            return (
              <div key={voucher._id} className="w-[320px] shrink-0">
                <VoucherCard
                  voucher={voucher}
                  accent="blue"
                  collected
                  actionLabel="Dùng ngay"
                  onClick={() => handleUseNow(voucher)}
                />
              </div>
            );
          }

          return (
            <div key={voucher._id} className="w-[320px] shrink-0">
              <VoucherCard
                voucher={voucher}
                accent="blue"
                collected={collected}
                actionLabel={voucherWalletActionLabel(walletStatus, isCollecting)}
                disabled={Boolean(walletStatus) || isCollecting}
                onClick={() =>
                  !walletStatus && !isCollecting && collectVoucher(voucher._id)
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
