"use client";
import UseGetCurrentUser from "@/hooks/UseGetCurrentUser";
import { AppDispatch, RootState } from "@/redux/store";
import { setUserData } from "@/redux/userSlice";
import axios from "axios";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";
import {
  AiOutlineUser,
  AiOutlineArrowLeft,
  AiOutlineCamera,
} from "react-icons/ai";
import {
  FaPhone,
  FaStore,
  FaMapLocationDot,
  FaReceipt,
  FaBagShopping,
  FaPenToSquare,
  FaShop,
} from "react-icons/fa6";
import { useDispatch, useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";
import AddressBook from "@/app/component/AddressBook";

const ROLE_LABEL: Record<string, string> = {
  user: "Người dùng",
  vendor: "Người bán hàng",
  admin: "Quản trị viên",
};

function Profile() {
  UseGetCurrentUser();
  const user = useSelector((state: RootState) => state.user.userData);
  const router = useRouter();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditShop, setShowEditShop] = useState(false);

  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [shopName, setShopName] = useState(user?.shopName || "");
  const [shopAddress, setShopAddress] = useState(user?.shopAddress || "");
  const [taxNumber, setTaxNumber] = useState(user?.taxNumber || "");
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setPhone(user.phone || "");
    setShopName(user.shopName || "");
    setShopAddress(user.shopAddress || "");
    setTaxNumber(user.taxNumber || "");
  }, [user]);

  const handlePreviewImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileImage(file);
    setPreviewImage(URL.createObjectURL(file));
  };

  const handleUpdateProfile = async () => {
    if (!/^0\d{9}$/.test(phone.trim())) {
      alert(
        "Số điện thoại không hợp lệ — phải gồm 10 chữ số và bắt đầu bằng 0 (VD: 0901234567).",
      );
      return;
    }
    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone.trim());
    if (profileImage) formData.append("image", profileImage);

    setLoading(true);
    try {
      const result = await axios.post("/api/user/update-profile", formData);
      dispatch(setUserData(result.data));
      setLoading(false);
      alert("Cập nhật hồ sơ thành công ✅");
    } catch (error: any) {
      setLoading(false);
      alert(error?.response?.data?.message ?? "Cập nhật hồ sơ thất bại ❌");
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
      setLoading(false);
      alert("Cập nhật thông tin cửa hàng thành công ✅");
      router.push("/");
    } catch (error) {
      setLoading(false);
      alert("Cập nhật thông tin cửa hàng thất bại ❌");
    }
  };

  const avatarUrl =
    user?.image ||
    `https://ui-avatars.com/api/?background=0D8ABC&color=fff&size=120&name=${encodeURIComponent(user?.name || "User")}`;

  const isVendor = user?.role === "vendor";

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-950 via-slate-900 to-gray-950 text-white px-4 pt-20 pb-16">
      {/* Decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-600/6 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/6 rounded-full blur-3xl" />
      </div>

      {/* Back button */}
      <div className="max-w-3xl mx-auto mb-6">
        <motion.button
          whileHover={{ scale: 1.04, x: -3 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => router.push("/")}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-blue-500/20 hover:border-blue-500/40 text-gray-300 hover:text-white text-sm font-medium transition-all"
        >
          <AiOutlineArrowLeft size={18} />
          Về trang chủ
        </motion.button>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        {/* ── Hero card ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative rounded-2xl border border-blue-500/20 shadow-2xl shadow-blue-500/10 overflow-hidden"
        >
          {/* Banner strip */}
          <div
            className={`h-28 w-full ${
              isVendor
                ? "bg-linear-to-r from-emerald-900/70 via-teal-800/50 to-blue-900/70"
                : "bg-linear-to-r from-blue-900/70 via-indigo-800/50 to-violet-900/70"
            }`}
          />

          {/* Glassmorphism body */}
          <div className="bg-linear-to-br from-white/10 to-white/5 backdrop-blur-xl px-6 sm:px-10 pb-8">
            {/* Avatar + name row */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 -mt-14 mb-7">
              {/* Avatar with pulsing ring */}
              <motion.div whileHover={{ scale: 1.06 }} className="relative shrink-0">
                <div
                  className={`w-28 h-28 rounded-full overflow-hidden border-4 shadow-xl ${
                    isVendor
                      ? "border-emerald-500/70 shadow-emerald-500/25"
                      : "border-blue-500/70 shadow-blue-500/25"
                  }`}
                >
                  <Image
                    src={avatarUrl}
                    alt="avatar"
                    width={112}
                    height={112}
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Pulse ring */}
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.45, 0, 0.45] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className={`absolute inset-0 rounded-full border-2 ${
                    isVendor ? "border-emerald-400" : "border-blue-400"
                  }`}
                />
              </motion.div>

              {/* Text */}
              <div className="text-center sm:text-left sm:mb-1 flex-1">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {user?.name}
                </h2>
                <p className="text-gray-400 text-sm mt-0.5">{user?.email}</p>
                <motion.span
                  animate={{ opacity: [0.75, 1, 0.75] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`inline-block mt-2.5 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${
                    isVendor
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                      : "bg-blue-500/15 text-blue-300 border-blue-500/40"
                  }`}
                >
                  {ROLE_LABEL[user?.role ?? "user"] ?? user?.role}
                </motion.span>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-linear-to-r from-transparent via-blue-500/20 to-transparent mb-7" />

            {/* Info grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Phone */}
              <div className="group bg-white/5 hover:bg-white/8 border border-blue-500/15 hover:border-blue-500/35 rounded-xl p-4 transition-all duration-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <FaPhone className="text-blue-400" size={13} />
                  <span className="text-[11px] text-gray-500 uppercase font-bold tracking-widest">
                    Điện thoại
                  </span>
                </div>
                <p className="text-base font-semibold text-white">
                  {user?.phone || (
                    <span className="text-gray-500 font-normal italic text-sm">
                      Chưa cập nhật
                    </span>
                  )}
                </p>
              </div>

              {/* Account type */}
              <div
                className={`border rounded-xl p-4 ${
                  isVendor
                    ? "bg-linear-to-br from-emerald-600/12 to-emerald-500/8 border-emerald-500/25"
                    : "bg-linear-to-br from-blue-600/12 to-blue-500/8 border-blue-500/25"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <AiOutlineUser
                    className={isVendor ? "text-emerald-400" : "text-blue-400"}
                    size={15}
                  />
                  <span className="text-[11px] text-gray-500 uppercase font-bold tracking-widest">
                    Loại tài khoản
                  </span>
                </div>
                <p
                  className={`text-base font-bold uppercase ${
                    isVendor ? "text-emerald-400" : "text-blue-400"
                  }`}
                >
                  {ROLE_LABEL[user?.role ?? "user"] ?? user?.role}
                </p>
              </div>

              {/* Vendor-specific fields */}
              {isVendor && (
                <>
                  <div className="bg-white/5 hover:bg-white/8 border border-emerald-500/15 hover:border-emerald-500/35 rounded-xl p-4 transition-all duration-200">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FaStore className="text-emerald-400" size={13} />
                      <span className="text-[11px] text-gray-500 uppercase font-bold tracking-widest">
                        Tên cửa hàng
                      </span>
                    </div>
                    <p className="text-base font-semibold text-white">
                      {user?.shopName || (
                        <span className="text-gray-500 font-normal italic text-sm">
                          Chưa cập nhật
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="bg-white/5 hover:bg-white/8 border border-emerald-500/15 hover:border-emerald-500/35 rounded-xl p-4 transition-all duration-200">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FaMapLocationDot className="text-emerald-400" size={13} />
                      <span className="text-[11px] text-gray-500 uppercase font-bold tracking-widest">
                        Địa chỉ cửa hàng
                      </span>
                    </div>
                    <p className="text-base font-semibold text-white">
                      {user?.shopAddress || (
                        <span className="text-gray-500 font-normal italic text-sm">
                          Chưa cập nhật
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="bg-white/5 hover:bg-white/8 border border-emerald-500/15 hover:border-emerald-500/35 rounded-xl p-4 transition-all duration-200 sm:col-span-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FaReceipt className="text-emerald-400" size={13} />
                      <span className="text-[11px] text-gray-500 uppercase font-bold tracking-widest">
                        Mã số thuế
                      </span>
                    </div>
                    <p className="text-base font-semibold text-white">
                      {user?.taxNumber || (
                        <span className="text-gray-500 font-normal italic text-sm">
                          Chưa cập nhật
                        </span>
                      )}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Action buttons ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.45 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {user?.role === "user" && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => router.push("/orders")}
              className="flex items-center justify-center gap-2.5 bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 py-3.5 rounded-xl font-semibold shadow-lg shadow-blue-500/25 transition-all text-sm"
            >
              <FaBagShopping size={15} />
              Đơn hàng của tôi
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              setShowEditProfile(!showEditProfile);
              setShowEditShop(false);
            }}
            className={`flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold shadow-lg transition-all text-sm ${
              showEditProfile
                ? "bg-white/10 border border-blue-500/40 text-blue-300 shadow-none"
                : "bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-blue-500/25"
            }`}
          >
            <FaPenToSquare size={15} />
            {showEditProfile ? "Đóng chỉnh sửa" : "Chỉnh sửa hồ sơ"}
          </motion.button>

          {isVendor && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setShowEditShop(!showEditShop);
                setShowEditProfile(false);
              }}
              className={`flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-semibold shadow-lg transition-all text-sm ${
                showEditShop
                  ? "bg-white/10 border border-emerald-500/40 text-emerald-300 shadow-none"
                  : "bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow-emerald-500/25"
              }`}
            >
              <FaShop size={15} />
              {showEditShop ? "Đóng" : "Chỉnh sửa cửa hàng"}
            </motion.button>
          )}
        </motion.div>

        {/* ── Address book (user only) ── */}
        {user?.role === "user" && <AddressBook />}

        {/* ── Edit Profile form ── */}
        <AnimatePresence>
          {showEditProfile && (
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="bg-linear-to-br from-white/8 to-white/4 backdrop-blur-xl p-6 sm:p-8 rounded-2xl border border-blue-500/25 shadow-xl shadow-blue-500/10"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                  <FaPenToSquare className="text-blue-400" size={14} />
                </div>
                <h3 className="text-xl font-bold bg-linear-to-r from-blue-400 to-blue-300 bg-clip-text text-transparent">
                  Chỉnh sửa hồ sơ
                </h3>
              </div>
              <p className="text-gray-500 text-sm mb-7 ml-12">
                Cập nhật thông tin cá nhân của bạn
              </p>

              {/* Avatar upload */}
              <div className="flex flex-col items-center mb-8 pb-7 border-b border-blue-500/15">
                <motion.div
                  whileHover={{ scale: 1.06 }}
                  className="relative group mb-4 cursor-pointer"
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden border-3 border-blue-500/50 shadow-lg shadow-blue-500/20">
                    <Image
                      src={previewImage || avatarUrl}
                      width={96}
                      height={96}
                      alt="xem trước ảnh đại diện"
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
                    <AiOutlineCamera className="text-white" size={24} />
                  </div>
                </motion.div>
                <label className="cursor-pointer flex items-center gap-2 bg-white/6 hover:bg-white/10 border border-blue-500/20 hover:border-blue-500/40 px-5 py-2.5 rounded-xl text-sm font-medium transition-all text-gray-300 hover:text-white">
                  📸 Chọn ảnh đại diện
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handlePreviewImage}
                  />
                </label>
              </div>

              {/* Form fields */}
              <div className="space-y-5">
                <div>
                  <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    className="w-full p-3.5 bg-white/5 border border-blue-500/20 rounded-xl focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/15 transition-all text-white placeholder-gray-600"
                    placeholder="Nhập họ và tên"
                    onChange={(e) => setName(e.target.value)}
                    value={name}
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    className="w-full p-3.5 bg-white/5 border border-blue-500/20 rounded-xl focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/15 transition-all text-white placeholder-gray-600"
                    placeholder="VD: 0901234567"
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, ""))
                    }
                    value={phone}
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={loading}
                  onClick={handleUpdateProfile}
                  className="w-full bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 disabled:from-gray-600 disabled:to-gray-500 py-3.5 rounded-xl font-semibold shadow-lg shadow-blue-500/25 transition-all mt-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <ClipLoader color="white" size={22} />
                  ) : (
                    "💾 Lưu thay đổi"
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Edit Shop form ── */}
        <AnimatePresence>
          {showEditShop && (
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              className="bg-linear-to-br from-white/8 to-white/4 backdrop-blur-xl p-6 sm:p-8 rounded-2xl border border-emerald-500/25 shadow-xl shadow-emerald-500/10"
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <FaStore className="text-emerald-400" size={14} />
                </div>
                <h3 className="text-xl font-bold bg-linear-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
                  Chỉnh sửa thông tin cửa hàng
                </h3>
              </div>
              <p className="text-gray-500 text-sm mb-7 ml-12">
                Cập nhật thông tin cửa hàng của bạn
              </p>

              <div className="space-y-5">
                <div>
                  <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                    Tên cửa hàng
                  </label>
                  <input
                    type="text"
                    className="w-full p-3.5 bg-white/5 border border-emerald-500/20 rounded-xl focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 transition-all text-white placeholder-gray-600"
                    placeholder="Nhập tên cửa hàng"
                    onChange={(e) => setShopName(e.target.value)}
                    value={shopName}
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                    Địa chỉ cửa hàng
                  </label>
                  <input
                    type="text"
                    className="w-full p-3.5 bg-white/5 border border-emerald-500/20 rounded-xl focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 transition-all text-white placeholder-gray-600"
                    placeholder="Nhập địa chỉ cửa hàng"
                    onChange={(e) => setShopAddress(e.target.value)}
                    value={shopAddress}
                  />
                </div>

                <div>
                  <label className="text-[11px] text-gray-500 uppercase font-bold tracking-widest mb-2 block">
                    Mã số thuế
                  </label>
                  <input
                    type="text"
                    className="w-full p-3.5 bg-white/5 border border-emerald-500/20 rounded-xl focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 transition-all text-white placeholder-gray-600"
                    placeholder="Nhập mã số thuế"
                    onChange={(e) => setTaxNumber(e.target.value)}
                    value={taxNumber}
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleVerifyAgain}
                  disabled={loading}
                  className="w-full bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 disabled:from-gray-600 disabled:to-gray-500 py-3.5 rounded-xl font-semibold shadow-lg shadow-emerald-500/25 transition-all mt-1 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <ClipLoader color="white" size={18} />
                      Đang cập nhật...
                    </>
                  ) : (
                    "💾 Lưu thông tin cửa hàng"
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default Profile;
