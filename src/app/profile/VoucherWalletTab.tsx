"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaTicketAlt } from "react-icons/fa";
import VoucherCard from "@/app/component/VoucherCard";
import { savePreferredVoucher } from "@/lib/voucher/preferredVoucher";

type WalletVoucher = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  discountType: "fixed" | "percentage" | "freeship";
  discountValue: number;
  maxDiscount?: number;
  minSpend?: number;
  vendor?: string | { _id?: string; shopName?: string; name?: string } | null;
  startAt?: string;
  endAt?: string;
};

type WalletRow = {
  _id: string;
  status: "collected" | "reserved" | "used" | "expired";
  voucher?: WalletVoucher;
};

type StatusFilter = "" | "collected" | "reserved" | "used" | "expired";
type SlotFilter = "all" | "platform" | "shop" | "freeship";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "collected", label: "Đang lưu" },
  { value: "reserved", label: "Đang giữ bởi đơn" },
  { value: "used", label: "Đã dùng" },
  { value: "expired", label: "Hết hạn" },
];

const SLOT_OPTIONS: { value: SlotFilter; label: string }[] = [
  { value: "all", label: "Tất cả loại" },
  { value: "platform", label: "Voucher sàn" },
  { value: "shop", label: "Voucher shop" },
  { value: "freeship", label: "Freeship" },
];

const LIMIT = 24;

function getVoucherStatus(row: WalletRow) {
  const now = Date.now();
  const start = row.voucher?.startAt ? new Date(row.voucher.startAt).getTime() : null;
  const end = row.voucher?.endAt ? new Date(row.voucher.endAt).getTime() : null;

  if (row.status === "used")
    return { label: "Đã dùng", className: "bg-gray-500/15 text-gray-300 border-gray-500/25" };
  if (row.status === "reserved")
    return {
      label: "Đang giữ bởi đơn",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    };
  if (row.status === "expired" || (end && end < now)) {
    return { label: "Hết hạn", className: "bg-red-500/15 text-red-300 border-red-500/25" };
  }
  if (start && start > now) {
    return {
      label: "Chưa tới giờ dùng",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    };
  }
  if (end && end - now <= 3 * 24 * 60 * 60 * 1000) {
    return {
      label: "Sắp hết hạn",
      className: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    };
  }
  return {
    label: "Đang hiệu lực",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  };
}

function canUseNow(row: WalletRow) {
  if (row.status !== "collected" || !row.voucher) return false;
  const now = Date.now();
  const start = row.voucher.startAt ? new Date(row.voucher.startAt).getTime() : null;
  const end = row.voucher.endAt ? new Date(row.voucher.endAt).getTime() : null;
  return (!start || start <= now) && (!end || end >= now);
}

export default function VoucherWalletTab() {
  const router = useRouter();
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [status, setStatus] = useState<StatusFilter>("");
  const [slot, setSlot] = useState<SlotFilter>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reqIdRef = useRef(0);

  // Debounce search.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          slot,
          page: String(targetPage),
          limit: String(LIMIT),
          sort: "newest",
        });
        if (status) params.set("status", status);
        if (query) params.set("q", query);
        const res = await fetch(`/api/user/vouchers?${params.toString()}`);
        const data = await res.json();
        if (reqId !== reqIdRef.current) return;
        const incoming: WalletRow[] = data.vouchers ?? [];
        setRows((prev) => (replace ? incoming : [...prev, ...incoming]));
        setHasMore(Boolean(data.pagination?.hasMore));
        setPage(targetPage);
      } catch {
        if (reqId === reqIdRef.current) {
          if (replace) setRows([]);
          setError("Không thể tải ví voucher");
        }
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [slot, status, query],
  );

  useEffect(() => {
    void load(1, true);
  }, [load]);

  const handleUseNow = (voucher: WalletVoucher) => {
    savePreferredVoucher(voucher);
    router.push("/cart");
  };

  const validRows = rows.filter((row) => row.voucher);

  return (
    <div className="rounded-2xl border border-white/10 bg-linear-to-br from-white/[0.075] to-white/[0.035] p-6 shadow-xl shadow-black/25">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <FaTicketAlt className="text-blue-300" size={16} />
            Ví Voucher
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Các mã đã lưu, còn hiệu lực hoặc sắp hết hạn.
          </p>
        </div>
      </div>

      {/* Controls: search + status + slot */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Tìm mã hoặc tên voucher..."
          className="flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500/50"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className="rounded-xl border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-200 outline-none [color-scheme:dark] focus:border-blue-500/50"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={slot}
          onChange={(event) => setSlot(event.target.value as SlotFilter)}
          className="rounded-xl border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-200 outline-none [color-scheme:dark] focus:border-blue-500/50"
        >
          {SLOT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center text-sm text-gray-400">
          Đang tải ví voucher...
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : validRows.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-center">
          <FaTicketAlt size={28} className="mb-3 text-gray-600" />
          <p className="text-sm font-semibold text-gray-300">Chưa có voucher phù hợp</p>
          <p className="mt-1 text-xs text-gray-500">
            Hãy lưu thêm voucher từ trang sản phẩm, shop hoặc trang mã giảm giá.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {validRows.map((row) => {
              const voucherStatus = getVoucherStatus(row);
              const usable = canUseNow(row);
              return (
                <div key={row._id} className="relative">
                  <VoucherCard
                    voucher={row.voucher!}
                    variant="vertical"
                    accent="blue"
                    collected={row.status === "collected"}
                    actionLabel={usable ? "Dùng ngay" : undefined}
                    onClick={usable ? () => handleUseNow(row.voucher!) : undefined}
                  />
                  <span
                    className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-bold ${voucherStatus.className}`}
                  >
                    {voucherStatus.label}
                  </span>
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => load(page + 1, false)}
                className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/10 disabled:opacity-60"
              >
                {loading ? "Đang tải..." : "Tải thêm"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
