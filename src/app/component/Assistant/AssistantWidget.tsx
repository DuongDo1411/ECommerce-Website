"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { FaRobot, FaTimes } from "react-icons/fa";

import AssistantPanel from "@/app/component/Assistant/AssistantPanel";

// Ẩn trên các khu vực không phải luồng mua sắm của người mua — cổng admin/vendor
// riêng, các trang xác thực, onboarding vendor và trang thêm sản phẩm.
const HIDDEN_PREFIXES = [
  "/admin",
  "/vendor",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/become-vendor",
  "/addVendorProduct",
];

function isHiddenPath(pathname: string): boolean {
  return HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (isHiddenPath(pathname ?? "")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        // bottom-24 (không phải bottom-5): Next.js gắn nút "Dev Tools" ở đúng góc
        // trái dưới trong môi trường dev (bên trong <nextjs-portal>, render sau nên
        // đè lên và chặn click) — đo được qua DevTools: nút đó chiếm top 846-878px,
        // left 22-54px. Đặt widget cao hơn hẳn để không chồng, chỉ ảnh hưởng dev,
        // không xuất hiện ở production.
        className="fixed bottom-24 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xl shadow-indigo-900/40 transition hover:bg-indigo-500"
        aria-label={open ? "Đóng trợ lý AI mua sắm" : "Mở trợ lý AI mua sắm"}
      >
        {open ? <FaTimes size={20} /> : <FaRobot size={22} />}
      </button>
      <AnimatePresence>
        {open && <AssistantPanel key="assistant-panel" onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
