"use client";

// Màn hoàn trả của ADMIN — hai việc TÁCH BẠCH, cố ý không gộp:
//  1. Trọng tài (escalated): phán quyết ai đúng ai sai.
//  2. Hoàn tiền (refund_pending/refund_failed): xác nhận tiền đã thực sự chuyển.
// Gộp hai việc vào một nút sẽ khiến "đồng ý cho hoàn" bị hiểu nhầm thành "đã trả tiền",
// nên chúng đi qua hai endpoint riêng và hai form riêng.
//
// Số tiền hoàn luôn do server tính theo công thức — admin không nhập tay.

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
  FaExclamationTriangle,
  FaGavel,
  FaTimes,
} from "react-icons/fa";
import ReturnTimeline, {
  type HistoryEntry,
} from "@/app/component/Returns/ReturnTimeline";

const ESCALATION_STAGE_LABELS: Record<string, string> = {
  vendor_review: "Người bán từ chối / không phản hồi",
  return_shipping: "Sự cố khi hoàn hàng về",
  inspection: "Hàng đã về kho, kiểm định bế tắc",
  outbound_delivery: "Giao hàng đi thất bại",
};

const fmtMoney = (n?: number) =>
  `${Math.round(n ?? 0).toLocaleString("vi-VN")}₫`;

const TONE_CLASS: Record<string, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  active: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  bad: "border-red-500/30 bg-red-500/10 text-red-300",
  closed: "border-white/10 bg-white/5 text-gray-400",
};

const fmt = (n?: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")}₫`;

const FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "queue", label: "Cần xử lý" },
  { id: "escalated", label: "Chờ phân xử" },
  { id: "return_shipping", label: "Vận chuyển hoàn" },
  { id: "refund_pending", label: "Chờ hoàn tiền" },
  { id: "refund_failed", label: "Hoàn tiền lỗi" },
];

// process.env.NODE_ENV được Next.js thay thế tĩnh trong bundle client: các nút mô phỏng
// chỉ tồn tại ở bản dev, biến mất hoàn toàn ở production (bảo vệ lớp UI; endpoint vẫn tự
// khoá 404 ở production là lớp thứ hai).
const IS_DEV = process.env.NODE_ENV !== "production";

interface ReturnRow {
  _id: string;
  status: string;
  reasonCode?: string;
  description?: string;
  evidence?: string[];
  finalFaultParty?: string;
  appeal?: { reason?: string; evidence?: string[] };
  vendorDecision?: { reason?: string; evidence?: string[] };
  buyer?: { name?: string; email?: string };
  vendor?: { shopName?: string; name?: string };
  order?: { _id: string; totalAmount?: number };
  shipping?: {
    trackingCode?: string;
    payer?: string;
    mode?: string;
    buyerReadyAt?: string;
    handoverEvidence?: string[];
  };
  refund?: {
    amount?: number;
    status?: string;
    itemNet?: number;
    outboundShippingRefund?: number;
    returnShippingDeduction?: number;
  };
  escalation?: { stage?: string; reason?: string };
  // Server quyết định nút nào bấm được — UI chỉ render đúng những cái này.
  availableActions?: string[];
  history?: HistoryEntry[];
}

export default function AdminReturns() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ReturnRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // "queue" là mặc định của API (escalated + refund_pending + refund_failed).
      const q = filter === "queue" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/admin/returns${q}`);
      const data = await res.json();
      setRows(data.returns ?? []);
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
        <span className="h-6 w-1 rounded-full bg-blue-500" />
        <FaGavel className="text-blue-400" size={18} />
        <h1 className="text-xl font-bold text-white">Hoàn trả & hoàn tiền</h1>
        {!loading && (
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-400">
            {rows.length} case
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
                ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                : "border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-gray-400">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <p className="text-sm">Đang tải case hoàn trả...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-white/10 bg-white/[0.02] text-gray-500">
          <FaBoxOpen size={34} className="text-gray-700" />
          <p className="text-sm">Không có case nào.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <button
              type="button"
              key={r._id}
              onClick={() => setActive(r)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] p-4 text-left transition-colors hover:border-blue-500/30 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
                {r.buyer?.name ?? "—"} ↔{" "}
                {r.vendor?.shopName ?? r.vendor?.name ?? "—"}
                {r.refund?.amount ? ` · hoàn ${fmt(r.refund.amount)}` : ""}
              </p>
            </button>
          ))}
        </div>
      )}

      {active && (
        <AdminReturnDetail
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

function AdminReturnDetail({
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
  const [disposition, setDisposition] = useState("damaged");

  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const post = async (url: string, body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  const decide = (action: string) =>
    post(`/api/admin/returns/${row._id}/decision`, {
      action,
      reason,
      faultParty: fault,
      disposition,
    });

  const refund = (action: string) =>
    post(`/api/admin/returns/${row._id}/refund`, {
      action,
      method,
      reference,
      note,
    });

  // Chỉ dev: bơm sự kiện GHN (picked/delivered) vào đúng hàm webhook dùng, để demo được
  // chuỗi hoàn hàng trên sandbox — nơi kiện hàng không di chuyển thật nên GHN im lặng.
  // Endpoint tự khoá 404 ở production và vẫn đòi admin/CRON_SECRET là lớp bảo vệ thứ hai.
  const simulate = async (ghnStatus: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dev/ghn/returns/${row._id}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: ghnStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không mô phỏng được");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isEscalated = row.status === "escalated";
  const isRefundStage =
    row.status === "refund_pending" || row.status === "refund_failed";
  const isReturnShipping =
    row.status === "awaiting_return_shipment" ||
    row.status === "return_in_transit";
  // Nút chỉ hiện khi server cho phép ở đúng giai đoạn này — không còn "luôn hiện
  // Hàng đã về" như trước.
  const can = (a: string) => row.availableActions?.includes(a) ?? false;

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
        aria-labelledby="admin-return-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-lg border border-white/10 bg-gray-950 shadow-2xl shadow-black/60 sm:max-h-[90vh]"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-gray-950/95 px-4 py-4 backdrop-blur sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <FaGavel size={14} />
            </span>
            <h3 id="admin-return-title" className="font-semibold text-white">
              {isEscalated
                ? "Phân xử tranh chấp"
                : isRefundStage
                  ? "Hoàn tiền"
                  : isReturnShipping
                    ? "Vận chuyển hoàn"
                    : "Chi tiết hoàn trả"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết hoàn trả"
            title="Đóng"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
              {row.buyer?.name ?? "—"} ↔{" "}
              {row.vendor?.shopName ?? row.vendor?.name ?? "—"} · Đơn{" "}
              {fmt(row.order?.totalAmount)}
            </p>
          </div>

          {isEscalated && row.escalation?.stage && (
            <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 px-3 py-2.5 text-xs text-blue-200">
              Giai đoạn tranh chấp:{" "}
              <b>
                {ESCALATION_STAGE_LABELS[row.escalation.stage] ??
                  row.escalation.stage}
              </b>
            </div>
          )}

          {!!row.evidence?.length && (
            <div className="flex flex-wrap gap-2">
              {row.evidence.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <Image
                    src={url}
                    alt="Ảnh bằng chứng"
                    width={72}
                    height={72}
                    className="h-[72px] w-[72px] rounded-lg border border-white/10 object-cover transition-colors hover:border-blue-500/50"
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
                      className="h-16 w-16 rounded-lg border border-white/10 object-cover transition-colors hover:border-blue-500/50"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Hai phía của tranh chấp đặt cạnh nhau để đọc trước khi phán quyết. */}
          {row.vendorDecision?.reason && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm">
              <p className="text-xs text-gray-500">Người bán nói</p>
              <p className="mt-1 text-gray-300">{row.vendorDecision.reason}</p>
              {!!row.vendorDecision.evidence?.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.vendorDecision.evidence.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <Image
                        src={url}
                        alt="Ảnh kiểm định của người bán"
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-lg border border-white/10 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          {row.appeal?.reason && (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-sm">
              <p className="text-xs text-amber-300">Người mua khiếu nại</p>
              <p className="mt-1 text-amber-100">{row.appeal.reason}</p>
              {!!row.appeal.evidence?.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.appeal.evidence.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <Image
                        src={url}
                        alt="Ảnh khiếu nại của người mua"
                        width={56}
                        height={56}
                        className="h-14 w-14 rounded-lg border border-amber-500/25 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Trọng tài ── */}
          {isEscalated && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">
                  Kết luận bên có lỗi
                </label>
                <select
                  value={fault}
                  onChange={(e) => setFault(e.target.value)}
                  style={{ colorScheme: "dark" }}
                  className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
                >
                  {Object.entries(DECIDABLE_FAULT_LABELS).map(([k, v]) => (
                    <option key={k} value={k} className="bg-gray-900 text-gray-100">
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">
                  Xử lý hàng (chỉ áp dụng khi hàng đã về)
                </label>
                <select
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value)}
                  style={{ colorScheme: "dark" }}
                  className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="damaged" className="bg-gray-900 text-gray-100">
                    {DISPOSITION_LABELS.damaged}
                  </option>
                  <option value="restock" className="bg-gray-900 text-gray-100">
                    {DISPOSITION_LABELS.restock}
                  </option>
                </select>
              </div>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Lý do phán quyết (bắt buộc)…"
                className="w-full resize-y rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
              />

              <div className="grid gap-2 sm:grid-cols-2">
                {can("approve_return") && (
                  <button
                    disabled={busy}
                    onClick={() => decide("approve_return")}
                    className="min-h-10 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Buộc trả hàng
                  </button>
                )}
                {can("approve_refund_only") && (
                  <button
                    disabled={busy}
                    onClick={() => decide("approve_refund_only")}
                    className="min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hoàn tiền, không trả
                  </button>
                )}
                {can("approve_received_return") && (
                  <button
                    disabled={busy}
                    onClick={() => decide("approve_received_return")}
                    className="min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Hàng đã về — hoàn tiền
                  </button>
                )}
                {can("resolve_no_refund") && (
                  <button
                    disabled={busy}
                    onClick={() => decide("resolve_no_refund")}
                    className="min-h-10 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-gray-100 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Chấp nhận (không hoàn tiền)
                  </button>
                )}
                {can("reject") && (
                  <button
                    disabled={busy}
                    onClick={() => decide("reject")}
                    className="min-h-10 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Bác yêu cầu
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Hoàn tiền ── */}
          {isRefundStage && (
            <>
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                Số tiền phải hoàn: <b>{fmt(row.refund?.amount)}</b>
                <p className="mt-1 text-xs text-emerald-300">
                  Số tiền do hệ thống tính, không sửa được ở đây. Chỉ bấm “Đã
                  chuyển tiền” sau khi tiền thực sự đã đi.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-300">
                  Phương thức
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  style={{ colorScheme: "dark" }}
                  className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="bank_transfer" className="bg-gray-900 text-gray-100">Chuyển khoản ngân hàng</option>
                  <option value="vnpay_manual" className="bg-gray-900 text-gray-100">VNPay (thủ công)</option>
                  <option value="cash" className="bg-gray-900 text-gray-100">Tiền mặt</option>
                </select>
              </div>

              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Mã tham chiếu giao dịch"
                className="w-full rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Ghi chú (bắt buộc)…"
                className="w-full resize-y rounded-lg border border-white/10 bg-gray-900 px-3 py-2.5 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  disabled={busy}
                  onClick={() => refund("mark_processed")}
                  className="min-h-10 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Đã chuyển tiền
                </button>
                {row.status === "refund_pending" ? (
                  <button
                    disabled={busy}
                    onClick={() => refund("mark_failed")}
                    className="min-h-10 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Chuyển tiền lỗi
                  </button>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => refund("retry_refund")}
                    className="min-h-10 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-gray-100 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Thử lại
                  </button>
                )}
              </div>
            </>
          )}

          {!isEscalated && !isRefundStage && (
            <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-5 text-gray-400">
              Case đang do người mua/người bán xử lý — sàn chưa cần can thiệp.
              {row.finalFaultParty &&
                ` Kết luận: ${FAULT_LABELS[row.finalFaultParty]}.`}
            </p>
          )}

          {/* Bóc tách số tiền hoàn để admin thấy vì sao ra con số đó, không phải một
              con số trời ơi. */}
          {isRefundStage && !!row.refund?.amount && (
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-gray-400">
              <p className="mb-1.5 font-medium text-gray-200">Cách tính tiền hoàn</p>
              <div className="flex justify-between">
                <span>Tiền hàng hoàn</span>
                <span>{fmtMoney(row.refund.itemNet)}</span>
              </div>
              {!!row.refund.outboundShippingRefund && (
                <div className="flex justify-between">
                  <span>Hoàn phí ship gốc</span>
                  <span>{fmtMoney(row.refund.outboundShippingRefund)}</span>
                </div>
              )}
              {!!row.refund.returnShippingDeduction && (
                <div className="flex justify-between text-red-400">
                  <span>Trừ phí ship hoàn</span>
                  <span>−{fmtMoney(row.refund.returnShippingDeduction)}</span>
                </div>
              )}
              <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 font-semibold text-white">
                <span>Tổng hoàn</span>
                <span>{fmtMoney(row.refund.amount)}</span>
              </div>
            </div>
          )}

          {IS_DEV &&
            row.shipping?.mode === "ghn" &&
            (row.status === "awaiting_return_shipment" ||
              row.status === "return_in_transit") && (
              <div className="rounded-lg border border-dashed border-sky-500/30 bg-sky-500/10 px-3 py-2.5">
                <p className="mb-2 text-xs font-medium text-sky-300">
                  Công cụ demo — chỉ hiện ở môi trường phát triển
                </p>
                {row.status === "awaiting_return_shipment" && (
                  <>
                    <button
                      disabled={busy || !row.shipping?.buyerReadyAt}
                      onClick={() => simulate("picked")}
                      className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Mô phỏng GHN đã lấy hàng
                    </button>
                    {!row.shipping?.buyerReadyAt && (
                      <p className="mt-1.5 text-xs leading-5 text-sky-300">
                        Chờ người mua bấm “sẵn sàng bàn giao” trước khi mô phỏng
                        lấy hàng.
                      </p>
                    )}
                  </>
                )}
                {row.status === "return_in_transit" && (
                  <button
                    disabled={busy}
                    onClick={() => simulate("delivered")}
                    className="w-full rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mô phỏng GHN đã giao tới người bán
                  </button>
                )}
              </div>
            )}

          <div className="border-t border-white/10 pt-1">
            <ReturnTimeline history={row.history} dark />
          </div>
        </div>
      </div>
    </div>
  );
}
