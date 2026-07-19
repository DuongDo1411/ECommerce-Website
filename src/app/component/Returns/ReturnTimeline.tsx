"use client";

// Dòng thời gian lịch sử case — dùng CHUNG cho cả 3 vai để buyer/vendor/admin nhìn thấy
// đúng một câu chuyện, không mỗi bên một kiểu. Chỉ nhận `history` đã có sẵn trên case,
// không tự gọi API.

import { actionLabel, HISTORY_ROLE_LABELS } from "@/lib/returns/labels";

export interface HistoryEntry {
  role?: string;
  action?: string;
  reason?: string;
  at?: string;
}

const fmtDate = (v?: string) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

// Component được dùng trên nhiều bề mặt sáng/tối, nên nhận `dark` để chữ luôn đủ tương phản.
export default function ReturnTimeline({
  history,
  dark = false,
}: {
  history?: HistoryEntry[];
  dark?: boolean;
}) {
  if (!history?.length) return null;

  const titleC = dark ? "text-gray-400" : "text-gray-500";
  const mainC = dark ? "text-gray-100" : "text-gray-800";
  const subC = dark ? "text-gray-500" : "text-gray-400";
  const reasonC = dark ? "text-gray-400" : "text-gray-500";
  const lineC = dark ? "bg-white/15" : "bg-gray-200";
  const dotIdle = dark ? "bg-gray-600" : "bg-gray-300";

  return (
    <div>
      <p className={`mb-2 text-xs font-medium ${titleC}`}>Diễn biến xử lý</p>
      <ol className="space-y-3">
        {history.map((h, i) => (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  i === history.length - 1 ? "bg-emerald-500" : dotIdle
                }`}
              />
              {i < history.length - 1 && (
                <span className={`mt-1 w-px flex-1 ${lineC}`} />
              )}
            </div>
            <div className="pb-1">
              <p className={`text-sm ${mainC}`}>{actionLabel(h.action)}</p>
              <p className={`text-xs ${subC}`}>
                {HISTORY_ROLE_LABELS[h.role ?? ""] ?? h.role}
                {h.at ? ` · ${fmtDate(h.at)}` : ""}
              </p>
              {h.reason && (
                <p className={`mt-0.5 text-xs italic ${reasonC}`}>
                  “{h.reason}”
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
