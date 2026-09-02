"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { FaPaperPlane, FaTimes } from "react-icons/fa";

import type { AssistantOrderCard, AssistantProductCard } from "@/lib/assistant/types";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: AssistantProductCard[];
  orders?: AssistantOrderCard[];
  isError?: boolean;
}

const MAX_HISTORY_TURNS = 8;

function formatVnd(amount: number): string {
  return amount.toLocaleString("vi-VN") + "₫";
}

function ProductCardList({ products }: { products: AssistantProductCard[] }) {
  if (products.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {products.map((p) => (
        <Link
          key={p.id}
          href={p.url}
          className="flex gap-2 rounded-xl border border-white/10 bg-[#101827] p-2 transition hover:border-indigo-500/50"
        >
          {p.image ? (
            <Image
              src={p.image}
              alt={p.title}
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-lg bg-gray-800" />
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white">{p.title}</p>
            <p className="text-xs text-indigo-300">{formatVnd(p.price)}</p>
            <p className="truncate text-[11px] text-gray-500">{p.shopName}</p>
            {!p.inStock && <p className="text-[11px] text-red-400">Hết hàng</p>}
            {p.availableSizes.length > 0 && (
              <p className="truncate text-[11px] text-gray-400">
                Size còn hàng: {p.availableSizes.map((s) => s.size).join(", ")}
              </p>
            )}
            {p.warranty && (
              <p className="truncate text-[11px] text-gray-500">Bảo hành: {p.warranty}</p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function OrderCardList({ orders }: { orders: AssistantOrderCard[] }) {
  if (orders.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {orders.map((o) => (
        <div
          key={o.id}
          className="rounded-xl border border-white/10 bg-[#101827] p-2 text-xs text-gray-300"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-white">#{o.id.slice(-8).toUpperCase()}</span>
            <span className="text-indigo-300">{o.statusLabel}</span>
          </div>
          <p className="truncate text-gray-500">
            {o.productTitles.join(", ") || "Đơn hàng"}
          </p>
          <p className="text-gray-400">{formatVnd(o.totalAmount)}</p>
        </div>
      ))}
    </div>
  );
}

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    // History dựng từ entries TRƯỚC khi thêm câu hỏi hiện tại — message đã mang
    // câu hỏi hiện tại riêng, đưa cả vào history nữa sẽ khiến Gemini nhận trùng.
    // Tin nhắn lỗi UI (isError) không phải nội dung hội thoại thật, loại khỏi history.
    const history = entries
      .filter((e) => !e.isError)
      .slice(-MAX_HISTORY_TURNS)
      .map((e) => ({ role: e.role, content: e.content }));

    const userEntry: ChatEntry = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setEntries((prev) => [...prev, userEntry]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history }),
      });
      const data = await res.json();

      if (!res.ok) {
        const message =
          res.status === 429
            ? "Bạn đang hỏi quá nhanh, vui lòng đợi một chút rồi thử lại."
            : res.status === 503
              ? "Trợ lý AI hiện chưa sẵn sàng, vui lòng thử lại sau."
              : res.status === 504
                ? "Trợ lý AI phản hồi quá lâu, vui lòng thử lại."
                : data?.message || "Có lỗi xảy ra, vui lòng thử lại.";
        setEntries((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: message, isError: true },
        ]);
        return;
      }

      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply as string,
          products: (data.products as AssistantProductCard[]) ?? [],
          orders: (data.orders as AssistantOrderCard[]) ?? [],
        },
      ]);
    } catch {
      setEntries((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Không kết nối được tới trợ lý AI, vui lòng thử lại.",
          isError: true,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      // bottom-44: khớp với nút mở đã dời lên bottom-24 (xem AssistantWidget.tsx)
      // để tránh chồng nút "Dev Tools" của Next.js ở môi trường dev.
      className="fixed bottom-44 left-5 z-40 flex h-[520px] w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-950 text-white shadow-2xl shadow-black/50"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-indigo-950/40 px-4">
        <div>
          <p className="text-sm font-semibold">Trợ lý AI mua sắm</p>
          <p className="text-[11px] text-gray-400">MultiCart · có thể trả lời chưa chính xác</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
          aria-label="Đóng"
        >
          <FaTimes size={14} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {entries.length === 0 && (
          <p className="mt-6 text-center text-xs text-gray-500">
            Hỏi tôi về sản phẩm, chính sách thanh toán/vận chuyển/đổi trả, hoặc đơn hàng của bạn nếu đã đăng nhập.
          </p>
        )}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                entry.role === "user"
                  ? "bg-indigo-600 text-white"
                  : entry.isError
                    ? "border border-red-500/30 bg-red-500/10 text-red-300"
                    : "bg-[#141b29] text-gray-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{entry.content}</p>
              {entry.products && <ProductCardList products={entry.products} />}
              {entry.orders && <OrderCardList orders={entry.orders} />}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-[#141b29] px-3 py-2 text-sm text-gray-400">
              Đang trả lời...
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
        className="flex h-16 shrink-0 items-center gap-2 border-t border-white/10 px-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendMessage(input);
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder="Nhập câu hỏi..."
          className="h-10 flex-1 resize-none rounded-xl border border-white/10 bg-[#101827] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={sending || input.trim().length === 0}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Gửi"
        >
          <FaPaperPlane size={14} />
        </button>
      </form>
    </motion.div>
  );
}
