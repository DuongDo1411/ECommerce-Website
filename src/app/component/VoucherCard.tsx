"use client";

import React from "react";
import { FaTicketAlt } from "react-icons/fa";

type VoucherLike = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  discountType: "fixed" | "percentage" | "freeship";
  discountValue: number;
  maxDiscount?: number;
  minSpend?: number;
  endAt?: string;
};

const money = (value: number) => `${Number(value ?? 0).toLocaleString("vi-VN")}₫`;

export default function VoucherCard({
  voucher,
  selected,
  collected,
  onClick,
  actionLabel,
  accent = "emerald",
  variant = "compact",
  disabled = false,
  estimatedDiscount,
  missingAmount,
}: {
  voucher: VoucherLike;
  selected?: boolean;
  collected?: boolean;
  onClick?: () => void;
  actionLabel?: string;
  accent?: "blue" | "emerald";
  variant?: "compact" | "vertical";
  disabled?: boolean;
  estimatedDiscount?: number;
  missingAmount?: number;
}) {
  const styles = {
    emerald: {
      selected: "border-emerald-400 bg-emerald-500/15",
      hover: "hover:border-emerald-400/50",
      icon: "bg-emerald-500/15 text-emerald-300",
      code: "text-emerald-300",
      text: "text-emerald-300",
    },
    blue: {
      selected: "border-blue-400 bg-blue-500/15",
      hover: "hover:border-blue-400/50",
      icon: "bg-blue-500/15 text-blue-300",
      code: "text-blue-300",
      text: "text-blue-300",
    },
  }[accent];

  const headline =
    voucher.discountType === "percentage"
      ? `Giảm ${voucher.discountValue}%${voucher.maxDiscount ? ` tối đa ${money(voucher.maxDiscount)}` : ""}`
      : voucher.discountType === "freeship"
        ? `Freeship${voucher.maxDiscount ? ` tối đa ${money(voucher.maxDiscount)}` : ""}`
        : `Giảm ${money(voucher.discountValue)}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-lg border transition ${
        variant === "vertical" ? "p-4 min-h-40" : "p-3"
      } ${
        selected
          ? styles.selected
          : `border-white/10 bg-white/5 ${styles.hover}`
      } ${disabled ? "cursor-not-allowed opacity-60 hover:border-white/10" : ""}`}
    >
      <div className={`flex items-start gap-3 ${variant === "vertical" ? "h-full flex-col" : ""}`}>
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
          <FaTicketAlt size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-white">{headline}</p>
              <p className="mt-0.5 text-xs text-gray-400">{voucher.title}</p>
            </div>
            <span className={`rounded-md bg-white/10 px-2 py-1 text-[10px] font-bold ${styles.code}`}>
              {voucher.code}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-400">
            <span>Đơn tối thiểu {money(voucher.minSpend ?? 0)}</span>
            {voucher.endAt && <span>HSD {new Date(voucher.endAt).toLocaleDateString("vi-VN")}</span>}
            {collected && !actionLabel && <span className={styles.text}>Đã lưu</span>}
            {actionLabel && <span className={`ml-auto ${styles.text}`}>{actionLabel}</span>}
          </div>
          {(typeof estimatedDiscount === "number" && estimatedDiscount > 0) ||
          (typeof missingAmount === "number" && missingAmount > 0) ? (
            <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
              {typeof estimatedDiscount === "number" && estimatedDiscount > 0 && (
                <span className={`font-semibold ${styles.text}`}>
                  Giảm dự kiến {money(estimatedDiscount)}
                </span>
              )}
              {typeof missingAmount === "number" && missingAmount > 0 && (
                <span className="font-medium text-amber-400">
                  Mua thêm {money(missingAmount)} để dùng
                </span>
              )}
            </div>
          ) : null}
          {variant === "vertical" && voucher.description && (
            <p className="mt-3 line-clamp-2 text-xs text-gray-500">
              {voucher.description}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
