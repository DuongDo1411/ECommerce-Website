"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  PASSWORD_RESET_TOKEN_STORAGE_KEY,
  resolveFragmentSecret,
} from "@/lib/security/fragmentSecret";

export default function ResetPasswordPage() {
  const router = useRouter();
  const tokenRef = useRef("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    tokenRef.current = resolveFragmentSecret(
      tokenRef.current,
      window.location.hash,
      "token",
      window.sessionStorage.getItem(PASSWORD_RESET_TOKEN_STORAGE_KEY),
    );
    if (tokenRef.current) {
      window.sessionStorage.setItem(
        PASSWORD_RESET_TOKEN_STORAGE_KEY,
        tokenRef.current,
      );
    }
    // Keep the secret out of browser history, screenshots and copied URLs as
    // soon as the client has captured it.
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tokenRef.current) {
      setMsg("Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      await axios.post("/api/auth/reset-password", {
        token: tokenRef.current,
        newPassword,
      });
      tokenRef.current = "";
      window.sessionStorage.removeItem(PASSWORD_RESET_TOKEN_STORAGE_KEY);
      setMsg("Đặt lại mật khẩu thành công! Đang chuyển tới đăng nhập…");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setMsg(
        axios.isAxiosError<{ message?: string }>(err)
          ? (err.response?.data?.message ?? "Có lỗi xảy ra")
          : "Có lỗi xảy ra",
      );
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-6">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-2">Đặt lại mật khẩu</h1>
        <p className="text-gray-400 text-sm mb-6">
          Nhập mật khẩu mới cho tài khoản của bạn.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mật khẩu mới (tối thiểu 12 ký tự)"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none focus:border-blue-500"
          />
          <button
            disabled={loading}
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold disabled:opacity-60"
          >
            {loading ? "Đang xử lý…" : "Đặt lại mật khẩu"}
          </button>
        </form>
        {msg && <p className="mt-4 text-sm text-gray-300">{msg}</p>}
      </div>
    </div>
  );
}
