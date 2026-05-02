"use client";
import UseGetCurrentUser from "@/hooks/UseGetCurrentUser";
import { RootState } from "@/redux/store";
import axios from "axios";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { AiOutlineUser } from "react-icons/ai";
import { FaPhone, FaStore, FaMapLocationDot, FaReceipt } from "react-icons/fa6";
import { useSelector } from "react-redux";
import { ClipLoader } from "react-spinners";

const DEFAULT_AVATAR =
  "https://ui-avatars.com/api/?background=0D8ABC&color=fff&size=120&name=User";

function Profile() {
  UseGetCurrentUser();
  const user = useSelector((state: RootState) => state.user.userData);
  const router = useRouter();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showEditShop, setShowEditShop] = useState(false);

  const [profileImage, setProfileImage] = useState<File | null>(null);

  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [shopName, setShopName] = useState(user?.shopName || "");
  const [shopAddress, setShopAddress] = useState(user?.shopAddress || "");
  const [taxNumber, setTaxNumber] = useState(user?.taxNumber || "");
  const [loading, setLoading] = useState(false);

  const handlePreviewImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileImage(file);
    setPreviewImage(URL.createObjectURL(file));
  };

  const handleVerifyAgain = async () => {
    if (!shopAddress || !shopName || !taxNumber) {
      alert("Fill all fields");
      return;
    }
    setLoading(true);
    try {
      const result = await axios.post("/api/vendor/verifyagain", {
        shopName,
        shopAddress,
        taxNumber,
      });
      setLoading(false);
      alert("Shop Details Updated ✅");
      router.push("/");
    } catch (error) {
      console.log(error);
      setLoading(false);
      alert("Fail to Update Shop Details ❌");
    }
  };

  const avatarUrl =
    user?.image ||
    `https://ui-avatars.com/api/?background=0D8ABC&color=fff&size=120&name=${encodeURIComponent(user?.name || "User")}`;

  const [previewImage, setPreviewImage] = useState<string>(avatarUrl);

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-gray-950 to-black text-white px-4 pt-24 pb-10">
      {/* Main Profile Card */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto bg-linear-to-br from-white/10 to-white/5 backdrop-blur-xl p-6 sm:p-12 rounded-2xl border border-blue-500/20 shadow-2xl shadow-blue-500/10"
      >
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="flex flex-col items-center text-center mb-10"
        >
          {/* Avatar */}
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="relative mb-6"
          >
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden border-3 border-blue-500/50 hover:border-blue-400 shadow-lg shadow-blue-500/30 transition-all">
              <Image
                src={avatarUrl}
                alt="profile"
                width={140}
                height={140}
                className="w-full h-full object-cover"
              />
            </div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-400 opacity-0 group-hover:opacity-100"
            />
          </motion.div>

          {/* User Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-2 bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
              {user?.name}
            </h2>
            <p className="text-gray-400 text-base">{user?.email}</p>
            <motion.p
              animate={{ color: ["#60a5fa", "#3b82f6", "#60a5fa"] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-sm mt-2 font-semibold uppercase tracking-widest"
            >
              {user?.role}
            </motion.p>
          </motion.div>

          {/* Decorative Line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="h-1 w-24 bg-linear-to-r from-blue-500 to-blue-600 rounded-full mt-6 mb-8"
          />
        </motion.div>

        {/* Info Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 pb-10 border-b border-blue-500/20"
        >
          {/* Phone */}
          <div className="bg-white/5 border border-blue-500/20 rounded-xl p-4 hover:border-blue-500/40 transition-all">
            <div className="flex items-center gap-3 mb-2">
              <FaPhone className="text-blue-400" size={18} />
              <span className="text-xs text-gray-500 uppercase font-semibold tracking-widest">
                Phone
              </span>
            </div>
            <p className="text-lg font-medium">{user?.phone || "-"}</p>
          </div>

          {/* Role Badge */}
          <div className="bg-linear-to-br from-blue-600/20 to-blue-500/20 border border-blue-500/30 rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <AiOutlineUser className="text-blue-400" size={20} />
              <span className="text-xs text-gray-500 uppercase font-semibold tracking-widest">
                Account Type
              </span>
            </div>
            <p className="text-lg font-bold text-blue-400 uppercase">
              {user?.role}
            </p>
          </div>

          {/* Vendor Shop Info */}
          {user?.role === "vendor" && (
            <>
              <div className="bg-white/5 border border-blue-500/20 rounded-xl p-4 hover:border-blue-500/40 transition-all">
                <div className="flex items-center gap-3 mb-2">
                  <FaStore className="text-blue-400" size={18} />
                  <span className="text-xs text-gray-500 uppercase font-semibold tracking-widest">
                    Shop Name
                  </span>
                </div>
                <p className="text-lg font-medium">{user?.shopName || "-"}</p>
              </div>

              <div className="bg-white/5 border border-blue-500/20 rounded-xl p-4 hover:border-blue-500/40 transition-all">
                <div className="flex items-center gap-3 mb-2">
                  <FaMapLocationDot className="text-blue-400" size={18} />
                  <span className="text-xs text-gray-500 uppercase font-semibold tracking-widest">
                    Shop Address
                  </span>
                </div>
                <p className="text-lg font-medium">
                  {user?.shopAddress || "-"}
                </p>
              </div>

              <div className="bg-white/5 border border-blue-500/20 rounded-xl p-4 hover:border-blue-500/40 transition-all">
                <div className="flex items-center gap-3 mb-2">
                  <FaReceipt className="text-blue-400" size={18} />
                  <span className="text-xs text-gray-500 uppercase font-semibold tracking-widest">
                    Tax Number
                  </span>
                </div>
                <p className="text-lg font-medium">{user?.taxNumber || "-"}</p>
              </div>
            </>
          )}
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {user?.role === "user" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/orders")}
              className="bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 py-3 rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition-all"
            >
              📦 My Orders
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setShowEditProfile(!showEditProfile);
              setShowEditShop(false);
            }}
            className="bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 py-3 rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition-all"
          >
            ✏️ Edit Profile
          </motion.button>

          {user?.role === "vendor" && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setShowEditShop(!showEditShop);
                setShowEditProfile(false);
              }}
              className="bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 py-3 rounded-xl font-semibold shadow-lg shadow-emerald-500/30 transition-all"
            >
              🏪 Edit Shop Details
            </motion.button>
          )}
        </motion.div>

        {/* Edit Profile Section */}
        <AnimatePresence>
          {showEditProfile && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 24 }}
              className="mt-10 bg-linear-to-br from-white/8 to-white/4 p-6 sm:p-8 rounded-xl border border-blue-500/30 shadow-xl shadow-blue-500/10"
            >
              <motion.h3
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-2xl font-bold mb-2 bg-linear-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent"
              >
                Edit Profile
              </motion.h3>
              <p className="text-gray-400 text-sm mb-6">
                Update your personal information
              </p>

              {/* Avatar Upload */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="flex flex-col items-center mb-8 pb-8 border-b border-blue-500/20"
              >
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  className="w-28 h-28 rounded-full overflow-hidden border-3 border-blue-500/50 hover:border-blue-400 shadow-lg shadow-blue-500/30 mb-4 transition-all"
                >
                  <Image
                    src={previewImage}
                    width={120}
                    height={120}
                    alt="select Image"
                    className="object-cover w-full h-full"
                  />
                </motion.div>
                <label className="cursor-pointer bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 px-6 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-blue-500/30 transition-all">
                  📸 Select Image
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={handlePreviewImage}
                  />
                </label>
              </motion.div>

              {/* Form Fields */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold tracking-widest mb-2 block">
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-white/5 border border-blue-500/20 rounded-lg focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-white placeholder-gray-500"
                    placeholder="Full name"
                    onChange={(e) => setName(e.target.value)}
                    value={name}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold tracking-widest mb-2 block">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-white/5 border border-blue-500/20 rounded-lg focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-white placeholder-gray-500"
                    placeholder="Phone"
                    onChange={(e) => setPhone(e.target.value)}
                    value={phone}
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-linear-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 py-3 rounded-lg font-semibold shadow-lg shadow-blue-500/30 transition-all mt-6"
                >
                  💾 Update Profile
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Shop Details Section */}
        <AnimatePresence>
          {showEditShop && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 200, damping: 24 }}
              className="mt-10 bg-linear-to-br from-white/8 to-white/4 p-6 sm:p-8 rounded-xl border border-emerald-500/30 shadow-xl shadow-emerald-500/10"
            >
              <motion.h3
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-2xl font-bold mb-2 bg-linear-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent"
              >
                Edit Shop Details
              </motion.h3>
              <p className="text-gray-400 text-sm mb-6">
                Update your shop information
              </p>

              {/* Form Fields */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="space-y-4"
              >
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold tracking-widest mb-2 block">
                    Shop Name
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-white/5 border border-emerald-500/20 rounded-lg focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-white placeholder-gray-500"
                    placeholder="Shop name"
                    onChange={(e) => setShopName(e.target.value)}
                    value={shopName}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold tracking-widest mb-2 block">
                    Shop Address
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-white/5 border border-emerald-500/20 rounded-lg focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-white placeholder-gray-500"
                    placeholder="Shop address"
                    onChange={(e) => setShopAddress(e.target.value)}
                    value={shopAddress}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold tracking-widest mb-2 block">
                    Tax Number
                  </label>
                  <input
                    type="text"
                    className="w-full p-3 bg-white/5 border border-emerald-500/20 rounded-lg focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-white placeholder-gray-500"
                    placeholder="Tax number"
                    onChange={(e) => setTaxNumber(e.target.value)}
                    value={taxNumber}
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleVerifyAgain}
                  disabled={loading}
                  className="w-full bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 disabled:from-gray-600 disabled:to-gray-500 py-3 rounded-lg font-semibold shadow-lg shadow-emerald-500/30 transition-all mt-6 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <ClipLoader color="white" size={18} />
                      Updating...
                    </>
                  ) : (
                    "💾 Update Shop Details"
                  )}
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default Profile;
