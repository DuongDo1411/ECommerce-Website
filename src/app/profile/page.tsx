"use client";

import UseGetCurrentUser from "@/hooks/UseGetCurrentUser";
import { AppDispatch, RootState } from "@/redux/store";
import { setUserData } from "@/redux/userSlice";
import axios from "axios";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  AiOutlineArrowLeft,
  AiOutlineLock,
  AiOutlineUser,
} from "react-icons/ai";
import { FaTicketAlt } from "react-icons/fa";
import { FaShop } from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import PasswordTab from "./PasswordTab";
import ProfileSettingsTab from "./ProfileSettingsTab";
import ShopSettingsTab from "./ShopSettingsTab";
import VoucherWalletTab from "./VoucherWalletTab";

type ProfileTab = "profile" | "shop" | "password" | "vouchers";
type GenderValue = "male" | "female" | "";

const ROLE_LABEL: Record<string, string> = {
  user: "Người dùng",
  vendor: "Người bán hàng",
  admin: "Quản trị viên",
};

function Profile() {
  UseGetCurrentUser();
  const user = useSelector((state: RootState) => state.user.userData);
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [gender, setGender] = useState<GenderValue>(
    user?.gender === "male" || user?.gender === "female" ? user.gender : "",
  );
  const [shopName, setShopName] = useState(user?.shopName || "");
  const [shopAddress, setShopAddress] = useState(user?.shopAddress || "");
  const [taxNumber, setTaxNumber] = useState(user?.taxNumber || "");
  const [loading, setLoading] = useState(false);

  const isVendor = user?.role === "vendor";
  const avatarUrl =
    user?.image ||
    `https://ui-avatars.com/api/?background=0D8ABC&color=fff&size=160&name=${encodeURIComponent(user?.name || "User")}`;

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setPhone(user.phone || "");
    setGender(
      user.gender === "male" || user.gender === "female" ? user.gender : "",
    );
    setShopName(user.shopName || "");
    setShopAddress(user.shopAddress || "");
    setTaxNumber(user.taxNumber || "");
  }, [user]);

  useEffect(() => {
    if (!isVendor && activeTab === "shop") {
      setActiveTab("profile");
    }
  }, [activeTab, isVendor]);

  const handlePreviewImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileImage(file);
    setPreviewImage(URL.createObjectURL(file));
  };

  const handleUpdateProfile = async () => {
    if (!/^0\d{9}$/.test(phone.trim())) {
      alert(
        "Số điện thoại không hợp lệ - phải gồm 10 chữ số và bắt đầu bằng 0 (VD: 0901234567).",
      );
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone.trim());
    if (gender) formData.append("gender", gender);
    if (profileImage) formData.append("image", profileImage);

    setLoading(true);
    try {
      const result = await axios.post("/api/user/update-profile", formData);
      dispatch(setUserData(result.data));
      setProfileImage(null);
      setPreviewImage(null);
      alert("Cập nhật hồ sơ thành công");
    } catch (error) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      alert(message ?? "Cập nhật hồ sơ thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAgain = async () => {
    if (!shopAddress || !shopName || !taxNumber) {
      alert("Vui lòng điền đầy đủ thông tin cửa hàng");
      return;
    }
    setLoading(true);
    try {
      await axios.post("/api/vendor/verifyagain", {
        shopName,
        shopAddress,
        taxNumber,
      });
      alert("Cập nhật thông tin cửa hàng thành công");
      router.push("/");
    } catch {
      alert("Cập nhật thông tin cửa hàng thất bại");
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { key: "profile" as const, label: "Hồ sơ", Icon: AiOutlineUser },
    ...(isVendor
      ? [{ key: "shop" as const, label: "Cửa hàng", Icon: FaShop }]
      : []),
    { key: "vouchers" as const, label: "Ví Voucher", Icon: FaTicketAlt },
    { key: "password" as const, label: "Mật khẩu", Icon: AiOutlineLock },
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#030712_0%,#0f172a_48%,#020617_100%)] text-white px-4 pt-20 pb-16">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => router.push("/")}
          className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/35 text-gray-300 hover:text-white text-sm font-medium transition-all"
        >
          <AiOutlineArrowLeft size={18} />
          Về trang chủ
        </button>

        {!user ? (
          <div className="min-h-[360px] flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <ClipLoader color="#60a5fa" size={30} />
          </div>
        ) : (
          <div className="grid md:grid-cols-[220px_1fr] gap-6 items-start">
            <aside className="rounded-2xl border border-white/10 bg-linear-to-br from-white/[0.075] to-white/[0.035] p-3 shadow-xl shadow-black/25 md:sticky md:top-24">
              <div className="hidden md:block px-3 py-4 border-b border-white/10 mb-3">
                <p className="text-sm font-semibold text-white truncate">
                  {user.name}
                </p>
                <p className="text-xs text-gray-500 truncate mt-1">
                  {ROLE_LABEL[user.role] ?? user.role}
                </p>
              </div>

              <div className="flex md:flex-col gap-2 overflow-x-auto">
                {tabs.map(({ key, label, Icon }) => {
                  const active = activeTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveTab(key)}
                      className={`shrink-0 md:w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                        active
                          ? "bg-blue-500/15 border-blue-500/30 text-blue-200"
                          : "bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06]"
                      }`}
                    >
                      <Icon size={17} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </aside>

            <motion.main
              key={activeTab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
            >
              {activeTab === "profile" && (
                <ProfileSettingsTab
                  user={user}
                  avatarUrl={avatarUrl}
                  previewImage={previewImage}
                  name={name}
                  phone={phone}
                  gender={gender}
                  loading={loading}
                  onNameChange={setName}
                  onPhoneChange={setPhone}
                  onGenderChange={setGender}
                  onPreviewImage={handlePreviewImage}
                  onSave={handleUpdateProfile}
                />
              )}

              {activeTab === "shop" && isVendor && (
                <ShopSettingsTab
                  shopName={shopName}
                  shopAddress={shopAddress}
                  taxNumber={taxNumber}
                  loading={loading}
                  onShopNameChange={setShopName}
                  onShopAddressChange={setShopAddress}
                  onTaxNumberChange={setTaxNumber}
                  onSave={handleVerifyAgain}
                />
              )}

              {activeTab === "password" && <PasswordTab user={user} />}

              {activeTab === "vouchers" && <VoucherWalletTab />}
            </motion.main>
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
