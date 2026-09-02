"use client";

import Link from "next/link";
import { useEffect } from "react";

// Trước khi có tệp này, một lỗi render bất kỳ (dưới root layout) rơi vào trang lỗi mặc định
// của Next.js — không có cách nào quay lại trang chủ ngoài nút Back của trình duyệt.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-linear-to-br from-gray-900 via-black to-gray-900 px-6 text-center text-white">
      <p className="text-sm font-semibold uppercase tracking-widest text-red-400">
        Đã có lỗi xảy ra
      </p>
      <h1 className="text-3xl font-bold sm:text-4xl">Không thể hiển thị trang này</h1>
      <p className="max-w-md text-gray-400">
        Vui lòng thử lại hoặc quay về trang chủ. Nếu lỗi lặp lại, hãy báo cho quản trị viên.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-white/10 px-6 py-3 font-semibold text-white transition-colors hover:bg-white/20"
        >
          Thử lại
        </button>
        <Link
          href="/"
          className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
