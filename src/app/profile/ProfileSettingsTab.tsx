"use client";

import AddressBook from "@/app/component/AddressBook";
import { IUser } from "@/model/user.model";
import Image from "next/image";
import React from "react";
import {
  AiOutlineCamera,
  AiOutlineMail,
  AiOutlineUser,
} from "react-icons/ai";
import {
  FaFloppyDisk,
  FaMars,
  FaPhone,
  FaVenus,
  FaVenusMars,
} from "react-icons/fa6";
import { ClipLoader } from "react-spinners";

type GenderValue = "male" | "female" | "";

interface ProfileSettingsTabProps {
  user: IUser;
  avatarUrl: string;
  previewImage: string | null;
  name: string;
  phone: string;
  gender: GenderValue;
  loading: boolean;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onGenderChange: (value: GenderValue) => void;
  onPreviewImage: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
}

export default function ProfileSettingsTab({
  user,
  avatarUrl,
  previewImage,
  name,
  phone,
  gender,
  loading,
  onNameChange,
  onPhoneChange,
  onGenderChange,
  onPreviewImage,
  onSave,
}: ProfileSettingsTabProps) {
  const inputCls =
    "w-full py-3.5 pl-11 pr-4 bg-white/5 border border-white/10 rounded-xl focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/15 focus:outline-none transition-all text-white placeholder-gray-600 disabled:cursor-not-allowed disabled:text-gray-500";

  return (
    <div className="space-y-6">
      <section className="bg-linear-to-br from-white/[0.075] to-white/[0.035] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/25">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <AiOutlineUser className="text-blue-300" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Hồ sơ cá nhân</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Cập nhật thông tin hiển thị và địa chỉ giao hàng.
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-52 shrink-0">
            <div className="flex flex-col items-center lg:items-start">
              <div className="relative group">
                <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-blue-500/45 shadow-lg shadow-blue-500/10">
                  <Image
                    src={previewImage || avatarUrl}
                    alt="Ảnh đại diện"
                    width={112}
                    height={112}
                    className="h-full w-full object-cover"
                  />
                </div>
                <label className="absolute inset-0 rounded-full bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                  <AiOutlineCamera className="text-white" size={24} />
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={onPreviewImage}
                  />
                </label>
              </div>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-200 hover:bg-blue-500/15 transition-colors">
                <AiOutlineCamera size={17} />
                Tải ảnh mới
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={onPreviewImage}
                />
              </label>
            </div>
          </div>

          <div className="flex-1 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                  Họ và tên
                </label>
                <div className="relative group">
                  <AiOutlineUser className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={18} />
                  <input
                    className={inputCls}
                    value={name}
                    placeholder="Nhập họ và tên"
                    onChange={(e) => onNameChange(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                  Email
                </label>
                <div className="relative">
                  <AiOutlineMail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input className={inputCls} value={user.email || ""} disabled />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                  Số điện thoại
                </label>
                <div className="relative group">
                  <FaPhone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-400 transition-colors" size={15} />
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    className={inputCls}
                    value={phone}
                    placeholder="VD: 0901234567"
                    onChange={(e) =>
                      onPhoneChange(e.target.value.replace(/\D/g, ""))
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 flex items-center gap-2">
                  <FaVenusMars size={13} />
                  Giới tính
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "male" as const, label: "Nam", Icon: FaMars },
                    { value: "female" as const, label: "Nữ", Icon: FaVenus },
                  ].map(({ value, label, Icon }) => {
                    const selected = gender === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onGenderChange(value)}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                          selected
                            ? "border-blue-500/40 bg-blue-500/15 text-blue-200"
                            : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              onClick={onSave}
              disabled={loading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-500 px-6 py-3.5 font-semibold shadow-lg shadow-blue-500/10 transition-all"
            >
              {loading ? (
                <ClipLoader color="white" size={18} />
              ) : (
                <>
                  <FaFloppyDisk size={15} />
                  Lưu thay đổi
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      <AddressBook />
    </div>
  );
}
