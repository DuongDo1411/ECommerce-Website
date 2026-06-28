"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import VoucherCard from "@/app/component/VoucherCard";
import {
  useCollectVoucher,
  voucherWalletActionLabel,
} from "./useCollectVoucher";
import { savePreferredVoucher } from "@/lib/voucher/preferredVoucher";
import type { PublicVoucher } from "@/lib/voucher/publicVoucherTypes";

type Filter = "all" | "platform" | "freeship" | "shop";
type Sort = "endingSoon" | "newest" | "bestValue";

const LIMIT = 24;

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "platform", label: "Voucher sàn" },
  { id: "freeship", label: "Freeship" },
  { id: "shop", label: "Voucher shop" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "endingSoon", label: "Sắp hết hạn" },
  { id: "newest", label: "Mới nhất" },
  { id: "bestValue", label: "Giá trị cao" },
];

export default function VoucherHub() {
  const router = useRouter();
  const [vouchers, setVouchers] = useState<PublicVoucher[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("endingSoon");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const { collectVoucher, collectingId, walletStatusById, message } =
    useCollectVoucher();

  // Debounce search -> query thực sự gửi lên server.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const reqIdRef = useRef(0);
  const loadPage = useCallback(
    async (targetPage: number, replace: boolean) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          slot: filter,
          sort,
          page: String(targetPage),
          limit: String(LIMIT),
        });
        if (query) params.set("q", query);
        const res = await fetch(`/api/vouchers?${params.toString()}`);
        const data = await res.json();
        if (reqId !== reqIdRef.current) return; // bỏ response cũ
        const incoming: PublicVoucher[] = data.vouchers ?? [];
        setVouchers((prev) => (replace ? incoming : [...prev, ...incoming]));
        setHasMore(Boolean(data.pagination?.hasMore));
        setPage(targetPage);
      } catch {
        if (reqId === reqIdRef.current) {
          if (replace) setVouchers([]);
          setHasMore(false);
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [filter, sort, query],
  );

  // Đổi filter/sort/query -> reset page 1 + clear list cũ.
  useEffect(() => {
    loadPage(1, true);
  }, [loadPage]);

  // "Dùng ngay": ghi preference rồi sang giỏ hàng; checkout tự chọn nếu hợp lệ.
  const handleUseNow = (voucher: PublicVoucher) => {
    savePreferredVoucher(voucher);
    router.push("/cart");
  };

  return (
    <main className="min-h-screen bg-gray-950 px-4 pb-16 pt-24 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-sm font-semibold text-blue-300">Trung tâm ưu đãi</p>
          <h1 className="mt-1 text-3xl font-black">Mã giảm giá</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Lưu voucher sàn, freeship và shop vào ví, rồi bấm “Dùng ngay” để áp ở
            bước thanh toán.
          </p>
        </div>

        {/* Search + sort */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo mã hoặc tên voucher..."
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500/50"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-200 outline-none [color-scheme:dark] focus:border-blue-500/50"
          >
            {SORTS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Slot tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                filter === tab.id
                  ? "border-blue-400 bg-blue-500/15 text-blue-200"
                  : "border-white/10 bg-white/5 text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {message && <p className="mb-4 text-sm text-blue-300">{message}</p>}

        {vouchers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-gray-400">
            {loading ? "Đang tải voucher..." : "Chưa có voucher phù hợp."}
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vouchers.map((voucher) => {
                const walletStatus =
                  voucher.walletStatus ?? walletStatusById.get(voucher._id);
                const collected = walletStatus === "collected";
                const isCollecting = collectingId === voucher._id;

                if (collected) {
                  return (
                    <VoucherCard
                      key={voucher._id}
                      voucher={voucher}
                      accent="blue"
                      variant="vertical"
                      collected
                      actionLabel="Dùng ngay"
                      onClick={() => handleUseNow(voucher)}
                    />
                  );
                }

                return (
                  <VoucherCard
                    key={voucher._id}
                    voucher={voucher}
                    accent="blue"
                    variant="vertical"
                    actionLabel={voucherWalletActionLabel(walletStatus, isCollecting)}
                    disabled={Boolean(walletStatus) || isCollecting}
                    onClick={() =>
                      !walletStatus && !isCollecting && collectVoucher(voucher._id)
                    }
                  />
                );
              })}
            </div>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  disabled={loading}
                  onClick={() => loadPage(page + 1, false)}
                  className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-60"
                >
                  {loading ? "Đang tải..." : "Tải thêm"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
