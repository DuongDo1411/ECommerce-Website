"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/logo.png";

/**
 * Các trang đăng nhập/đăng ký/kích hoạt/hoàn tất hồ sơ cố ý không render Navbar (toàn màn
 * hình, tối giản), nên nếu thiếu link này người dùng kẹt lại không có cách nào rời trang
 * ngoài nút Back của trình duyệt.
 */
export default function BackHomeBrand() {
  return (
    <Link
      href="/"
      className="fixed left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md transition-colors hover:bg-white/10"
    >
      <Image
        src={logo}
        alt="MultiCart"
        width={28}
        height={28}
        className="rounded-full"
      />
      <span className="hidden text-sm font-bold bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent sm:inline">
        MultiCart
      </span>
    </Link>
  );
}
