"use client";

// Modal hoàn trả phía NGƯỜI MUA — gộp 2 vai trò vào 1 chỗ:
//  - đơn chưa có yêu cầu → form tạo yêu cầu
//  - đơn đã có yêu cầu   → theo dõi tiến trình + các hành động còn được phép
// Gộp làm một vì với người mua đây là cùng một việc ("trả hàng"); tách hai màn chỉ
// khiến họ phải tự đoán mình đang ở bước nào.

import {
  FAULT_LABELS,
  RETURN_REASON_LABELS,
  RETURN_STATUS_TONE,
  returnReasonLabel,
  returnStatusLabel,
} from "@/lib/returns/labels";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { FaTimes } from "react-icons/fa";
import ReturnTimeline, {
  type HistoryEntry,
} from "@/app/component/Returns/ReturnTimeline";

const TONE_CLASS: Record<string, string> = {
  pending: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  active: "bg-blue-500/15 border-blue-500/30 text-blue-300",
  good: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  bad: "bg-red-500/15 border-red-500/30 text-red-300",
  closed: "bg-gray-700/40 border-white/10 text-gray-400",
};

const fmt = (n?: number) => `${Math.round(n ?? 0).toLocaleString("vi-VN")}₫`;

interface ReturnCase {
  _id: string;
  status: string;
  caseType?: string;
  reasonCode?: string;
  description?: string;
  evidence?: string[];
  resolution?: string;
  finalFaultParty?: string;
  vendorDecision?: { reason?: string; evidence?: string[]; at?: string };
  adminDecision?: { reason?: string; at?: string };
  shipping?: {
    mode?: string;
    payer?: string;
    carrier?: string;
    trackingCode?: string;
    status?: string;
    buyerReadyAt?: string;
    handoverEvidence?: string[];
    from?: {
      name?: string;
      phone?: string;
      address?: string;
      wardName?: string;
      districtName?: string;
      provinceName?: string;
    };
    ghn?: { orderCode?: string; expectedDeliveryTime?: string };
  };
  refund?: { amount?: number; status?: string; reference?: string };
  deadlines?: { shipment?: string; appeal?: string };
  history?: HistoryEntry[];
}

const SHIP_STATUS_LABELS: Record<string, string> = {
  creating: "Đang tạo vận đơn",
  creation_failed: "Tạo vận đơn lỗi — người bán sẽ tạo lại",
  ready_to_pick: "Chờ đơn vị vận chuyển lấy hàng",
  picked: "Đã lấy hàng",
  storing: "Đang lưu kho trung chuyển",
  transporting: "Đang vận chuyển",
  sorting: "Đang phân loại",
  delivering: "Đang giao tới người bán",
  delivered: "Đã giao tới người bán",
};

const fmtDateTime = (d?: string) =>
  d
    ? new Date(d).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "";

export default function ReturnModal({
  orderId,
  returnRequestId,
  onClose,
  onDone,
}: {
  orderId: string;
  returnRequestId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [caseData, setCaseData] = useState<ReturnCase | null>(null);
  // Server quyết định nút nào bấm được (gồm cả confirm_ready_for_pickup vốn không nằm
  // trong bảng transition) — UI chỉ render đúng danh sách này, không tự suy luận.
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!returnRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form tạo yêu cầu
  const [reasonCode, setReasonCode] = useState("damaged");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  // form hành động trên case
  const [actionReason, setActionReason] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  const loadCase = useCallback(async () => {
    if (!returnRequestId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/returns/${returnRequestId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không tải được yêu cầu");
      setCaseData(data.returnRequest);
      setActions(data.availableActions ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [returnRequestId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const submitCreate = async () => {
    if (busy) return;
    if (!description.trim()) {
      setError("Vui lòng mô tả chi tiết vấn đề");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("reasonCode", reasonCode);
      form.append("description", description.trim());
      files.forEach((f) => form.append("files", f));

      const res = await fetch(`/api/orders/${orderId}/return-request`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không gửi được yêu cầu");
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submitAction = async (action: string) => {
    if (busy || !returnRequestId) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("action", action);
      if (actionReason.trim()) form.append("reason", actionReason.trim());
      if (action === "submit_manual_shipment") {
        form.append("carrier", carrier.trim());
        form.append("trackingCode", trackingCode.trim());
        // Ảnh biên nhận tự gửi (tuỳ chọn) — cùng field "files" như bằng chứng khác.
        files.forEach((f) => form.append("files", f));
      }
      if (action === "appeal") files.forEach((f) => form.append("files", f));

      const res = await fetch(`/api/returns/${returnRequestId}`, {
        method: "PATCH",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không cập nhật được");
      onDone();
      await loadCase();
      setActionReason("");
      setFiles([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Lấy URL in nhãn GHN (server sinh token mỗi lần) rồi mở tab mới để in.
  const printLabel = async () => {
    if (busy || !returnRequestId) return;
    // Mở tab ngay trong user gesture; chờ fetch xong mới window.open thường bị Chrome
    // xem là popup bất ngờ và chặn mất.
    const printTab = window.open("about:blank", "_blank");
    if (!printTab) {
      setError("Trình duyệt đang chặn tab in nhãn. Vui lòng cho phép popup rồi thử lại.");
      return;
    }
    printTab.opener = null;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/returns/${returnRequestId}/label`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Không lấy được nhãn");
      printTab.location.href = data.url;
    } catch (e) {
      printTab.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const can = (a: string) => actions.includes(a);
  const status = caseData?.status;
  const tone = RETURN_STATUS_TONE[status as keyof typeof RETURN_STATUS_TONE];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={
        returnRequestId ? "Yêu cầu trả hàng" : "Gửi yêu cầu trả hàng"
      }
      onClick={(event) => {
        // This dialog is rendered inside DetailModal. Keep clicks from reaching
        // the parent backdrop, otherwise any form interaction closes both modals.
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-gray-900 shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-gray-900 px-5 py-4">
          <h3 className="font-semibold text-white">
            {returnRequestId ? "Yêu cầu trả hàng" : "Gửi yêu cầu trả hàng"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white"
          >
            <FaTimes size={14} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Đang tải…</p>
          ) : caseData ? (
            /* ───────────── Theo dõi case ───────────── */
            <>
              <div
                className={`rounded-xl border px-3 py-2 text-sm font-medium ${TONE_CLASS[tone] ?? TONE_CLASS.closed}`}
              >
                {returnStatusLabel(status)}
              </div>

              <div className="space-y-1 text-sm text-gray-300">
                <p>
                  <span className="text-gray-500">Lý do: </span>
                  {returnReasonLabel(caseData.reasonCode)}
                </p>
                {caseData.description && (
                  <p className="text-gray-400">{caseData.description}</p>
                )}
              </div>

              {!!caseData.evidence?.length && (
                <div className="flex flex-wrap gap-2">
                  {caseData.evidence.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <Image
                        src={url}
                        alt="Ảnh bằng chứng"
                        width={64}
                        height={64}
                        className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                      />
                    </a>
                  ))}
                </div>
              )}

              {caseData.shipping?.trackingCode && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <p className="text-gray-400">
                    Mã vận đơn hoàn:{" "}
                    <span className="font-mono text-white">
                      {caseData.shipping.trackingCode}
                    </span>
                  </p>
                  {caseData.shipping.payer === "buyer" && (
                    <p className="mt-1 text-xs text-amber-300">
                      Phí ship hoàn do bạn chịu và sẽ được trừ vào tiền hoàn.
                    </p>
                  )}
                </div>
              )}

              {!!caseData.shipping?.handoverEvidence?.length && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    Ảnh biên nhận bàn giao
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {caseData.shipping.handoverEvidence.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer">
                        <Image
                          src={url}
                          alt="Ảnh biên nhận bàn giao"
                          width={64}
                          height={64}
                          className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {!!caseData.refund?.amount && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm">
                  <p className="text-emerald-300">
                    Số tiền hoàn: <b>{fmt(caseData.refund.amount)}</b>
                  </p>
                  {caseData.refund.reference && (
                    <p className="mt-1 font-mono text-xs text-emerald-400/80">
                      Mã tham chiếu: {caseData.refund.reference}
                    </p>
                  )}
                </div>
              )}

              {(caseData.vendorDecision?.reason ??
                caseData.adminDecision?.reason) && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                  <p className="mb-1 text-xs text-gray-500">
                    {caseData.adminDecision?.reason
                      ? "Phán quyết của sàn"
                      : "Phản hồi của người bán"}
                  </p>
                  <p className="text-gray-300">
                    {caseData.adminDecision?.reason ??
                      caseData.vendorDecision?.reason}
                  </p>
                  {!!caseData.vendorDecision?.evidence?.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {caseData.vendorDecision.evidence.map((url) => (
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
                  {caseData.finalFaultParty && (
                    <p className="mt-1 text-xs text-gray-500">
                      Kết luận: {FAULT_LABELS[caseData.finalFaultParty]}
                    </p>
                  )}
                </div>
              )}

              {/* ── Hành động còn được phép ── */}
              {status === "vendor_rejected" && (
                <div className="space-y-2 rounded-xl border border-white/10 p-3">
                  <p className="text-xs text-gray-400">
                    Không đồng ý? Gửi khiếu nại để sàn phân xử.
                  </p>
                  <textarea
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    rows={3}
                    placeholder="Lý do khiếu nại…"
                    className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                  />
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                    className="w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => submitAction("appeal")}
                      className="flex-1 rounded-lg bg-amber-600/80 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      Khiếu nại
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => submitAction("accept_rejection")}
                      className="rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
                    >
                      Chấp nhận
                    </button>
                  </div>
                </div>
              )}

              {/* ── Chờ gửi qua GHN: hướng dẫn đóng gói + in nhãn + xác nhận sẵn sàng ── */}
              {status === "awaiting_return_shipment" &&
                caseData.shipping?.mode === "ghn" && (
                  <div className="space-y-3 rounded-xl border border-white/10 p-3">
                    <div className="space-y-1 text-sm">
                      {caseData.shipping.status && (
                        <p className="text-gray-400">
                          Trạng thái vận chuyển:{" "}
                          <span className="text-white">
                            {SHIP_STATUS_LABELS[caseData.shipping.status] ??
                              caseData.shipping.status}
                          </span>
                        </p>
                      )}
                      {caseData.deadlines?.shipment && (
                        <p className="text-amber-300">
                          Hạn gửi hàng: trước{" "}
                          {fmtDateTime(caseData.deadlines.shipment)}
                        </p>
                      )}
                    </div>

                    {caseData.shipping.from && (
                      <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-300">
                        <p className="mb-1 text-gray-500">Địa chỉ lấy hàng</p>
                        <p className="text-white">
                          {caseData.shipping.from.name}
                          {caseData.shipping.from.phone
                            ? ` — ${caseData.shipping.from.phone}`
                            : ""}
                        </p>
                        <p>
                          {[
                            caseData.shipping.from.address,
                            caseData.shipping.from.wardName,
                            caseData.shipping.from.districtName,
                            caseData.shipping.from.provinceName,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      </div>
                    )}

                    {caseData.shipping.buyerReadyAt ? (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                        Đã xác nhận sẵn sàng bàn giao lúc{" "}
                        {fmtDateTime(caseData.shipping.buyerReadyAt)}.
                        <span className="mt-0.5 block text-emerald-400/80">
                          Chờ GHN đến lấy hàng.
                        </span>
                      </div>
                    ) : (
                      <ul className="space-y-1 text-xs text-gray-400">
                        <li>• Đóng đủ sản phẩm và phụ kiện kèm theo.</li>
                        <li>• Chèn lót, đóng gói chắc chắn tránh va đập.</li>
                        <li>• Dán hoặc ghi mã vận đơn lên kiện hàng.</li>
                      </ul>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={printLabel}
                        className="min-w-40 flex-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50"
                      >
                        In nhãn gửi hàng
                      </button>
                      {!caseData.shipping.buyerReadyAt &&
                        can("confirm_ready_for_pickup") && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              submitAction("confirm_ready_for_pickup")
                            }
                            className="min-w-52 flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Đã đóng gói, sẵn sàng bàn giao
                          </button>
                        )}
                    </div>
                  </div>
                )}

              {/* ── GHN đã lấy hàng: đang trên đường về người bán ── */}
              {status === "return_in_transit" && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-300">
                  {caseData.shipping?.mode === "manual"
                    ? "Đã ghi nhận vận đơn tự gửi. Kiện hàng đang trên đường về người bán."
                    : "Đơn vị vận chuyển đã lấy hàng. Kiện hàng đang trên đường về người bán."}
                </div>
              )}

              {status === "awaiting_return_shipment" &&
                caseData.shipping?.mode !== "ghn" &&
                can("submit_manual_shipment") && (
                  <div className="space-y-2 rounded-xl border border-white/10 p-3">
                    <p className="text-xs text-gray-400">
                      Tự gửi hàng? Nhập thông tin vận đơn và ảnh biên nhận (nếu
                      có).
                    </p>
                    <input
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder="Hãng vận chuyển"
                      className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                    />
                    <input
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      placeholder="Mã vận đơn"
                      className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                    />
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                      className="w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
                    />
                    {files.length > 0 && (
                      <p className="text-xs text-gray-500">
                        Đã chọn {files.length} ảnh biên nhận
                      </p>
                    )}
                    <button
                      disabled={busy}
                      onClick={() => submitAction("submit_manual_shipment")}
                      className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      Xác nhận đã gửi
                    </button>
                  </div>
                )}

              {(status === "requested" ||
                status === "awaiting_return_shipment") && (
                <button
                  disabled={busy}
                  onClick={() => submitAction("buyer_cancel")}
                  className="w-full rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                >
                  Huỷ yêu cầu trả hàng
                </button>
              )}

              <div className="border-t border-white/10 pt-3">
                <ReturnTimeline history={caseData.history} dark />
              </div>
            </>
          ) : (
            /* ───────────── Form tạo yêu cầu ───────────── */
            <>
              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Lý do trả hàng
                </label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                >
                  {Object.entries(RETURN_REASON_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Mô tả chi tiết
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Mô tả rõ vấn đề để người bán xử lý nhanh hơn…"
                  className="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-gray-400">
                  Ảnh bằng chứng (tối đa 5 ảnh, mỗi ảnh ≤ 5MB)
                </label>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
                />
                {files.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    Đã chọn {files.length} ảnh
                  </p>
                )}
              </div>

              <button
                disabled={busy}
                onClick={submitCreate}
                className="w-full rounded-lg bg-orange-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {busy ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
