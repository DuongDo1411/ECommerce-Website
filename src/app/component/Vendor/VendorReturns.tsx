"use client";

// Màn hoàn trả của NGƯỜI BÁN: duyệt/từ chối yêu cầu, và kiểm định khi hàng về.
//
// Hai quyết định ở đây có hệ quả tiền và kho nên form ép chọn rõ ràng thay vì để mặc
// định: duyệt phải chốt BÊN CÓ LỖI (quyết định ai trả phí ship hoàn và có hoàn phí ship
// gốc không), kiểm định phải chốt XỬ LÝ HÀNG (chỉ "restock" mới cộng lại tồn kho).
// Số tiền hoàn do server tính theo công thức — màn này không cho nhập tay.

import {
  DECIDABLE_FAULT_LABELS,
  DISPOSITION_LABELS,
  FAULT_LABELS,
  RETURN_STATUS_TONE,
  returnReasonLabel,
  returnStatusLabel,
} from "@/lib/returns/labels";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  FaBoxOpen,
  FaCheck,
  FaExclamationTriangle,
  FaMoneyBillWave,
  FaTimes,
  FaTruck,
  FaUndoAlt,
} from "react-icons/fa";
import ReturnTimeline, {
  type HistoryEntry,
} from "@/app/component/Returns/ReturnTimeline";

const TONE_CLASS: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  active: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  bad: "border-red-500/30 bg-red-500/10 text-red-300",
  closed: "border-white/10 bg-white/5 text-gray-400",
};

const fmt = (n?: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")}₫`;

const FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "open", label: "Cần xử lý" },
  { id: "requested", label: "Chờ duyệt" },
  { id: "inspection_pending", label: "Chờ kiểm định" },
];

interface ReturnRow {
  _id: string;
  status: string;
  reasonCode?: string;
  description?: string;
  evidence?: string[];
  finalFaultParty?: string;
  createdAt?: string;
  buyer?: { name?: string; email?: string };
  order?: { _id: string; totalAmount?: number };
  shipping?: {
    mode?: string;
    trackingCode?: string;
    payer?: string;
    status?: string;
    handoverEvidence?: string[];
  };
  refund?: { amount?: number; status?: string };
  // Server quyết định nút nào bấm được — UI chỉ render đúng những cái này.
  availableActions?: string[];
  history?: HistoryEntry[];
}

export default function VendorReturns() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ReturnRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // "Cần xử lý" gộp 2 trạng thái nên phải lấy tất rồi lọc ở client.
      const q = filter === "all" || filter === "open" ? "all" : filter;
      const res = await fetch(`/api/vendor/returns?status=${q}`);
      const data = await res.json();
      let list: ReturnRow[] = data.returns ?? [];
      if (filter === "open") {
        list = list.filter(
          (r) => r.status === "requested" || r.status === "inspection_pending",
        );
      }
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-6 w-1 rounded-full bg-emerald-500" />
        <FaUndoAlt className="text-emerald-400" size={18} />
        <h1 className="text-xl font-bold text-white">Hoàn trả</h1>
        {!loading && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-400">
            {rows.length} yêu cầu
          </span>
        )}
      </div>

      <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-gray-400">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm">Đang tải yêu cầu...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/10 bg-white/[0.02] text-gray-500">
          <FaBoxOpen size={34} className="text-gray-700" />
          <p className="text-sm">Không có yêu cầu nào.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <button
              type="button"
              key={r._id}
              onClick={() => setActive(r)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:border-emerald-500/30 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-gray-400">
                  #{String(r.order?._id ?? "").slice(-8).toUpperCase()}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    TONE_CLASS[
                      RETURN_STATUS_TONE[
                        r.status as keyof typeof RETURN_STATUS_TONE
                      ]
                    ] ?? TONE_CLASS.closed
                  }`}
                >
                  {returnStatusLabel(r.status)}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-100">
                {returnReasonLabel(r.reasonCode)}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {r.buyer?.name ?? "—"} · {fmt(r.order?.totalAmount)}
              </p>
            </button>
          ))}
        </div>
      )}

      {active && (
        <VendorReturnDetail
          row={active}
          onClose={() => setActive(null)}
          onDone={() => {
            setActive(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function VendorReturnDetail({
  row,
  onClose,
  onDone,
}: {
  row: ReturnRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [fault, setFault] = useState("vendor");
  const [disposition, setDisposition] = useState("restock");
  const [files, setFiles] = useState<File[]>([]);

  const send = async (action: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("action", action);
      if (reason.trim()) form.append("reason", reason.trim());
      if (action === "approve_return" || action === "approve_refund_only") {
        form.append("faultParty", fault);
      }
      if (action === "accept_inspection") {
        form.append("disposition", disposition);
      }
      files.forEach((f) => form.append("files", f));

      const res = await fetch(`/api/vendor/returns/${row._id}`, {
        method: "PATCH",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không cập nhật được");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Tạo lại vận đơn hoàn là endpoint RIÊNG (không phải transition), nên gọi tách.
  const retryShipping = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor/returns/${row._id}/shipping`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không tạo được vận đơn");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const can = (a: string) => row.availableActions?.includes(a) ?? false;
  const isRequested = row.status === "requested";
  const isInspection = row.status === "inspection_pending";
  const shipmentFailed =
    row.status === "awaiting_return_shipment" &&
    row.shipping?.status === "creation_failed";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-return-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 sm:max-h-[90vh]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-gray-950/95 px-4 py-4 backdrop-blur sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <FaUndoAlt size={14} />
            </span>
            <h3 id="vendor-return-title" className="font-semibold text-white">
              Yêu cầu hoàn trả
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết hoàn trả"
            title="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            <FaTimes size={14} />
          </button>
        </div>

        <div className="space-y-5 px-4 py-4 sm:px-5">
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs text-red-300"
            >
              <FaExclamationTriangle className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="text-sm">
            <p className="font-semibold text-gray-100">
              {returnReasonLabel(row.reasonCode)}
            </p>
            {row.description && (
              <p className="mt-1 leading-6 text-gray-300">{row.description}</p>
            )}
            <p className="mt-1.5 text-xs text-gray-500">
              Người mua: {row.buyer?.name ?? "—"} · Đơn{" "}
              {fmt(row.order?.totalAmount)}
            </p>
          </div>

          {!!row.evidence?.length && (
            <div className="flex flex-wrap gap-2">
              {row.evidence.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <Image
                    src={url}
                    alt="Ảnh bằng chứng"
                    width={72}
                    height={72}
                    className="h-[72px] w-[72px] rounded-lg border border-white/10 object-cover transition-colors hover:border-emerald-500/50"
                  />
                </a>
              ))}
            </div>
          )}

          {!!row.shipping?.handoverEvidence?.length && (
            <div>
              <p className="mb-2 text-xs font-medium text-gray-500">
                Ảnh biên nhận bàn giao
              </p>
              <div className="flex flex-wrap gap-2">
                {row.shipping.handoverEvidence.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <Image
                      src={url}
                      alt="Ảnh biên nhận bàn giao"
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-lg border border-white/10 object-cover transition-colors hover:border-emerald-500/50"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {row.shipping?.trackingCode && (
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-gray-300">
              Vận đơn hoàn:{" "}
              <span className="font-mono text-emerald-300">
                {row.shipping.trackingCode}
              </span>
            </p>
          )}

          {/* ── Duyệt / từ chối ── */}
          {isRequested && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">
                  Bên chịu trách nhiệm
                </label>
                <select
                  value={fault}
                  onChange={(e) => setFault(e.target.value)}
                  style={{ colorScheme: "dark" }}
                  className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
                >
                  {Object.entries(DECIDABLE_FAULT_LABELS).map(([k, v]) => (
                    <option key={k} value={k} className="bg-gray-900 text-gray-100">
                      {v}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs leading-5 text-gray-500">
                  Quyết định ai trả phí ship hoàn và có hoàn phí ship gốc không.
                </p>
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Ghi chú / lý do (bắt buộc khi từ chối)…"
                className="w-full resize-y rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send("approve_return")}
                  className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FaCheck size={12} />
                  Duyệt trả hàng
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send("approve_refund_only")}
                  className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FaMoneyBillWave size={13} />
                  Hoàn tiền, không cần trả
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => send("reject")}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaTimes size={12} />
                Từ chối yêu cầu
              </button>
            </>
          )}

          {/* ── Kiểm định khi hàng đã về ── */}
          {isInspection && (
            <>
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-200">
                Hàng hoàn đã về. Kiểm tra rồi chốt xử lý — chỉ &quot;nhập lại
                kho&quot; mới cộng tồn kho trở lại.
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">
                  Xử lý hàng hoàn
                </label>
                <select
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value)}
                  style={{ colorScheme: "dark" }}
                  className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
                >
                  <option value="restock" className="bg-gray-900 text-gray-100">
                    {DISPOSITION_LABELS.restock}
                  </option>
                  <option value="damaged" className="bg-gray-900 text-gray-100">
                    {DISPOSITION_LABELS.damaged}
                  </option>
                </select>
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Ghi chú kiểm định (bắt buộc khi từ chối)…"
                className="w-full resize-y rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
              />
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="w-full rounded-lg border border-white/10 bg-gray-900 text-xs text-gray-400 file:mr-3 file:border-0 file:bg-white/10 file:px-3 file:py-2.5 file:text-xs file:font-medium file:text-gray-200 hover:file:bg-white/15"
              />
              <p className="text-xs text-gray-500">
                Từ chối sau kiểm định bắt buộc kèm ảnh bằng chứng.
              </p>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send("accept_inspection")}
                  className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FaCheck size={12} />
                  Đạt — hoàn tiền
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send("reject_inspection")}
                  className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FaTimes size={12} />
                  Không đạt
                </button>
              </div>
            </>
          )}

          {/* Vận đơn tự khai: không có GHN đẩy sự kiện, vendor tự xác nhận đã nhận. */}
          {can("mark_received") && (
            <div className="space-y-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
              <p className="text-xs leading-5 text-amber-200">
                Người mua tự gửi hàng
                {row.shipping?.trackingCode
                  ? ` (mã ${row.shipping.trackingCode})`
                  : ""}
                . Khi nhận được, hãy xác nhận để chuyển sang kiểm định.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => send("mark_received")}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaBoxOpen size={13} />
                Xác nhận đã nhận hàng
              </button>
            </div>
          )}

          {/* Tạo GHN hỏng lúc duyệt → cho tạo lại thay vì kẹt. */}
          {shipmentFailed && (
            <div className="space-y-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3">
              <p className="text-xs text-red-200">
                Tạo vận đơn hoàn qua GHN chưa thành công.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={retryShipping}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FaTruck size={13} />
                Tạo lại vận đơn hoàn
              </button>
            </div>
          )}

          {!isRequested &&
            !isInspection &&
            !can("mark_received") &&
            !shipmentFailed && (
              <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-5 text-gray-400">
                Hiện không có hành động nào cho trạng thái này.
                {row.finalFaultParty &&
                  ` Kết luận: ${FAULT_LABELS[row.finalFaultParty]}.`}
                {row.refund?.amount
                  ? ` Tiền hoàn: ${fmt(row.refund.amount)}.`
                  : ""}
              </p>
            )}

          <div className="border-t border-white/10 pt-4">
            <ReturnTimeline history={row.history} dark />
          </div>
        </div>
      </div>
    </div>
  );
}
