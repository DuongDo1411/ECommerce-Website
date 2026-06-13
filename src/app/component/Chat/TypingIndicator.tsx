"use client";

import React from "react";

export default function TypingIndicator({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="msg-fade-in-up flex items-center gap-2 border-t border-white/[0.04] bg-[#101827] px-4 py-2 text-xs text-gray-400">
      <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.05] px-3 py-1.5">
        <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </div>
      <span>Đang gõ tin nhắn...</span>
    </div>
  );
}
