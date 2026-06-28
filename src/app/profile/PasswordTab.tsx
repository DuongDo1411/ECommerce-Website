"use client";

import { IUser } from "@/model/user.model";
import axios from "axios";
import { useState } from "react";
import {
  AiOutlineEye,
  AiOutlineEyeInvisible,
  AiOutlineLock,
} from "react-icons/ai";
import { FaFloppyDisk } from "react-icons/fa6";
import { ClipLoader } from "react-spinners";

interface PasswordTabProps {
  user: IUser;
}

type PasswordField = "current" | "next" | "confirm";

export default function PasswordTab({ user }: PasswordTabProps) {
  const isGoogleAccount = user.hasPassword === false;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const inputCls =
    "w-full py-3.5 pl-11 pr-11 bg-white/5 border border-white/10 rounded-xl focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition-all text-white placeholder-gray-600 disabled:cursor-not-allowed disabled:text-gray-500";

  const toggleVisible = (field: PasswordField) => {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSubmit = async () => {
    setMessage(null);
    if (isGoogleAccount) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ type: "error", text: "Vui lòng nhập đầy đủ mật khẩu." });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({
        type: "error",
        text: "Mật khẩu mới phải có ít nhất 6 ký tự.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({
        type: "error",
        text: "Mật khẩu xác nhận không khớp.",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await axios.post("/api/user/change-password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({
        type: "success",
        text: res.data?.message ?? "Đổi mật khẩu thành công.",
      });
    } catch (error) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      setMessage({
        type: "error",
        text: message ?? "Đổi mật khẩu thất bại.",
      });
    } finally {
      setSaving(false);
    }
  };

  const renderPasswordField = (
    field: PasswordField,
    label: string,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
  ) => (
    <div>
      <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
        {label}
      </label>
      <div className="relative group">
        <AiOutlineLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
        <input
          type={visible[field] ? "text" : "password"}
          className={inputCls}
          value={value}
          placeholder={placeholder}
          disabled={isGoogleAccount || saving}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          disabled={isGoogleAccount}
          onClick={() => toggleVisible(field)}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
        >
          {visible[field] ? (
            <AiOutlineEyeInvisible size={18} />
          ) : (
            <AiOutlineEye size={18} />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <section className="bg-linear-to-br from-white/[0.075] to-white/[0.035] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/25">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
          <AiOutlineLock className="text-blue-300" size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Mật khẩu</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cập nhật mật khẩu đăng nhập cho tài khoản của bạn.
          </p>
        </div>
      </div>

      {isGoogleAccount && (
        <div className="mb-6 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
          Tài khoản của bạn đang được liên kết với Google. Mật khẩu được quản
          lý bởi Google.
        </div>
      )}

      <div className="space-y-5">
        {renderPasswordField(
          "current",
          "Mật khẩu hiện tại",
          currentPassword,
          setCurrentPassword,
          "Nhập mật khẩu hiện tại",
        )}
        {renderPasswordField(
          "next",
          "Mật khẩu mới",
          newPassword,
          setNewPassword,
          "Tối thiểu 6 ký tự",
        )}
        {renderPasswordField(
          "confirm",
          "Xác nhận mật khẩu mới",
          confirmPassword,
          setConfirmPassword,
          "Nhập lại mật khẩu mới",
        )}

        {message && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                : "border-red-500/25 bg-red-500/10 text-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={isGoogleAccount || saving}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-700 disabled:to-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed px-6 py-3.5 font-semibold shadow-lg shadow-blue-500/10 transition-all"
        >
          {saving ? (
            <ClipLoader color="white" size={18} />
          ) : (
            <>
              <FaFloppyDisk size={15} />
              Lưu mật khẩu
            </>
          )}
        </button>
      </div>
    </section>
  );
}
