"use client";

import axios from "axios";
import { useState, type FormEvent } from "react";
import BackHomeBrand from "../component/BackHomeBrand";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    try {
      await axios.post("/api/auth/forgot-password", { email });
      setMsg(
        "Nếu email tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.",
      );
    } catch {
      setMsg("Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6">
      <BackHomeBrand />
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-2">Quên mật khẩu</h1>
        <p className="text-gray-400 text-sm mb-6">
          Nhập email để nhận liên kết đặt lại mật khẩu.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-blue-500"
          />
          <button
            disabled={loading}
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold disabled:opacity-60"
          >
            {loading ? "Đang gửi…" : "Gửi liên kết"}
          </button>
        </form>
        {msg && <p className="mt-4 text-sm text-gray-300">{msg}</p>}
      </div>
    </div>
  );
}
