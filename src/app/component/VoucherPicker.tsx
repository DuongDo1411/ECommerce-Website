"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FaTicketAlt, FaTimes } from "react-icons/fa";
import VoucherCard from "./VoucherCard";
import type {
  CandidateReason,
  VoucherCandidate,
} from "@/lib/voucher/candidateTypes";

export type VoucherSelection = {
  shopVoucherCodes: string[];
  platformVoucherCode: string;
  freeshipVoucherCode: string;
};

const REASON_LABEL: Record<CandidateReason, string> = {
  not_collected: "Chưa lưu",
  not_started: "Chưa tới thời gian sử dụng",
  expired: "Đã hết hạn",
  quota_exhausted: "Đã hết lượt",
  wrong_vendor: "Không áp dụng cho shop trong giỏ",
  wrong_slot: "Sai loại voucher",
  min_spend: "Chưa đạt giá trị tối thiểu",
  not_applicable: "Không áp dụng cho sản phẩm trong giỏ",
  reserved: "Đang được giữ bởi đơn khác",
  used: "Đã sử dụng",
};

function reasonLabel(reason?: CandidateReason) {
  return reason ? (REASON_LABEL[reason] ?? "Không khả dụng") : "Không khả dụng";
}

function voucherLike(candidate: VoucherCandidate) {
  return {
    _id: candidate.voucherId,
    code: candidate.code,
    title: candidate.title,
    description: candidate.description,
    discountType: candidate.discountType,
    discountValue: candidate.discountValue,
    maxDiscount: candidate.maxDiscount,
    minSpend: candidate.minSpend,
    endAt: candidate.endAt,
  };
}

export default function VoucherPicker({
  selection,
  candidates,
  onChange,
  onCollect,
  loading = false,
}: {
  selection: VoucherSelection;
  candidates: VoucherCandidate[];
  onChange: (selection: VoucherSelection) => void;
  // Lưu voucher vào ví; trả true nếu đã lưu thành công (hoặc đã có sẵn).
  onCollect: (voucherId: string) => Promise<boolean>;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [collectingId, setCollectingId] = useState("");

  const closePicker = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePicker, open]);

  const shopCandidates = useMemo(
    () => candidates.filter((c) => c.slot === "shop" && c.eligible),
    [candidates],
  );
  const platformCandidates = useMemo(
    () => candidates.filter((c) => c.slot === "platform" && c.eligible),
    [candidates],
  );
  const freeshipCandidates = useMemo(
    () => candidates.filter((c) => c.slot === "freeship" && c.eligible),
    [candidates],
  );
  const unavailable = useMemo(
    () => candidates.filter((c) => !c.eligible),
    [candidates],
  );

  const isSelected = useCallback(
    (candidate: VoucherCandidate) => {
      if (candidate.slot === "shop") return selection.shopVoucherCodes.includes(candidate.code);
      if (candidate.slot === "platform") return selection.platformVoucherCode === candidate.code;
      return selection.freeshipVoucherCode === candidate.code;
    },
    [selection],
  );

  // Áp 1 shop voucher / vendor: bỏ mã shop cũ cùng vendor trước khi thêm mã mới.
  const applyShop = useCallback(
    (candidate: VoucherCandidate, add: boolean) => {
      const kept = selection.shopVoucherCodes.filter((code) => {
        const match = candidates.find((c) => c.code === code);
        return match?.vendorId !== candidate.vendorId;
      });
      onChange({
        ...selection,
        shopVoucherCodes: add ? [...kept, candidate.code] : kept,
      });
    },
    [candidates, onChange, selection],
  );

  const toggle = useCallback(
    (candidate: VoucherCandidate) => {
      const selected = isSelected(candidate);
      if (candidate.slot === "shop") {
        applyShop(candidate, !selected);
      } else if (candidate.slot === "platform") {
        onChange({ ...selection, platformVoucherCode: selected ? "" : candidate.code });
      } else {
        onChange({ ...selection, freeshipVoucherCode: selected ? "" : candidate.code });
      }
    },
    [applyShop, isSelected, onChange, selection],
  );

  const collectAndSelect = useCallback(
    async (candidate: VoucherCandidate) => {
      if (collectingId) return;
      setCollectingId(candidate.voucherId);
      try {
        const ok = await onCollect(candidate.voucherId);
        if (!ok) return;
        if (candidate.slot === "shop") {
          applyShop(candidate, true);
        } else if (candidate.slot === "platform") {
          onChange({ ...selection, platformVoucherCode: candidate.code });
        } else {
          onChange({ ...selection, freeshipVoucherCode: candidate.code });
        }
      } finally {
        setCollectingId("");
      }
    },
    [applyShop, collectingId, onChange, onCollect, selection],
  );

  const renderEligible = (candidate: VoucherCandidate) => {
    const selected = isSelected(candidate);
    if (candidate.collected) {
      return (
        <VoucherCard
          key={candidate.voucherId}
          voucher={voucherLike(candidate)}
          selected={selected}
          estimatedDiscount={candidate.estimatedDiscount}
          actionLabel={selected ? "Bỏ chọn" : "Chọn"}
          onClick={() => toggle(candidate)}
        />
      );
    }
    return (
      <VoucherCard
        key={candidate.voucherId}
        voucher={voucherLike(candidate)}
        selected={selected}
        estimatedDiscount={candidate.estimatedDiscount}
        actionLabel={collectingId === candidate.voucherId ? "Đang lưu..." : "Lưu & chọn"}
        onClick={() => collectAndSelect(candidate)}
      />
    );
  };

  const selectedCount =
    selection.shopVoucherCodes.length +
    (selection.platformVoucherCode ? 1 : 0) +
    (selection.freeshipVoucherCode ? 1 : 0);

  const hasEligible =
    shopCandidates.length + platformCandidates.length + freeshipCandidates.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 transition hover:border-emerald-400"
      >
        <span className="flex items-center gap-2 font-semibold">
          <FaTicketAlt size={13} />
          Mã giảm giá
        </span>
        <span className="text-xs text-emerald-300">
          {selectedCount > 0 ? `${selectedCount} mã đã chọn` : "Chọn voucher"}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={closePicker}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="voucher-picker-title"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-gray-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 id="voucher-picker-title" className="text-base font-bold text-white">
                Chọn voucher
              </h3>
              <button
                type="button"
                onClick={closePicker}
                aria-label="Đóng"
                className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white"
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
              {loading ? (
                <p className="text-sm text-gray-400">Đang kiểm tra voucher...</p>
              ) : (
                <>
                  {!hasEligible && unavailable.length === 0 && (
                    <p className="text-sm text-gray-400">
                      Không có voucher nào áp dụng cho giỏ hàng này.
                    </p>
                  )}

                  <section className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Voucher Shop
                    </h4>
                    {shopCandidates.length === 0 ? (
                      <p className="text-xs text-gray-500">Không có voucher shop khả dụng.</p>
                    ) : (
                      shopCandidates.map(renderEligible)
                    )}
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Voucher sàn
                    </h4>
                    {platformCandidates.length === 0 ? (
                      <p className="text-xs text-gray-500">Không có voucher sàn khả dụng.</p>
                    ) : (
                      platformCandidates.map(renderEligible)
                    )}
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Freeship
                    </h4>
                    {freeshipCandidates.length === 0 ? (
                      <p className="text-xs text-gray-500">Không có voucher freeship khả dụng.</p>
                    ) : (
                      freeshipCandidates.map(renderEligible)
                    )}
                  </section>

                  {unavailable.length > 0 && (
                    <section className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                        Không khả dụng
                      </h4>
                      {unavailable.map((candidate) => (
                        <VoucherCard
                          key={candidate.voucherId}
                          voucher={voucherLike(candidate)}
                          actionLabel={reasonLabel(candidate.reason)}
                          missingAmount={candidate.missingAmount}
                          disabled
                        />
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
