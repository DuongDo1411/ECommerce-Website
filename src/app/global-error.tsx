"use client";

// Chỉ chạy khi chính root layout ném lỗi, nên tệp này phải tự khai báo <html>/<body> và
// không được dựa vào bất cứ thứ gì layout cung cấp (kể cả Tailwind) — dùng style nội tuyến
// theo đúng khuyến nghị của Next.js cho global-error.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          background: "#0a0a0a",
          color: "#fff",
          fontFamily: "sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Đã có lỗi xảy ra</h1>
        <p style={{ color: "#9ca3af", maxWidth: 420 }}>
          Ứng dụng gặp sự cố không mong muốn. Vui lòng tải lại trang.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={reset}
            style={{
              borderRadius: "0.75rem",
              padding: "0.75rem 1.5rem",
              fontWeight: 600,
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Thử lại
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- root layout đã hỏng, Link cần context router mà layout đó cung cấp nên không dùng được ở đây */}
          <a
            href="/"
            style={{
              borderRadius: "0.75rem",
              padding: "0.75rem 1.5rem",
              fontWeight: 600,
              background: "#2563eb",
              color: "#fff",
              textDecoration: "none",
            }}
          >
            Về trang chủ
          </a>
        </div>
      </body>
    </html>
  );
}
