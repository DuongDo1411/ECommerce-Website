import Link from "next/link";
import { getOptionalUser } from "@/lib/rbac";
import Footer from "./component/Footer";
import Navbar from "./component/Navbar";

// Trước khi có tệp này, mọi đường dẫn sai (sản phẩm/cửa hàng đã xoá, gõ nhầm URL) đều rơi
// vào trang 404 mặc định của Next.js — không có Navbar/Footer, không có cách nào quay lại
// trang chủ ngoài nút Back của trình duyệt.
export default async function NotFound() {
  const ctx = await getOptionalUser();
  const plainUser = ctx ? JSON.parse(JSON.stringify(ctx.user)) : null;

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-br from-gray-900 via-black to-gray-900 font-sans text-white">
      <Navbar user={plainUser} />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pt-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
          Lỗi 404
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">Không tìm thấy trang</h1>
        <p className="max-w-md text-gray-400">
          Đường dẫn này không tồn tại hoặc đã bị thay đổi. Kiểm tra lại liên kết hoặc quay về
          trang chủ.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-500"
        >
          Về trang chủ
        </Link>
      </main>
      <Footer user={plainUser} />
    </div>
  );
}
