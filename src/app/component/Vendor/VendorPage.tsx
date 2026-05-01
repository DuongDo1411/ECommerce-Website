"use client";
import { IUser } from "@/model/user.model";
import React, { useState } from "react";
import VendorDashBoard from "./VendorDashBoard";
import axios from "axios";
import { useRouter } from "next/navigation";
import { ClipLoader } from "react-spinners";

function VendorPage({ user }: { user: IUser }) {
  const [openVerifyform, setOpenVerifyform] = useState(false);
  const [shopName, setShopName] = useState(user?.shopName || "");
  const [shopAddress, setShopAddress] = useState(user?.shopAddress || "");
  const [taxNumber, setTaxNumber] = useState(user?.taxNumber || "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      console.log(result.data);
      setLoading(false);
      alert("Verifycation request sent again ✅");
      router.push("/");
    } catch (error) {
      console.log(error);
      setLoading(false);
      alert("Fail to send verification ❌");
    }
  };
  if (!user) {
    return (
      <div
        className="w-full min-h-screen flex items-center
    justify-center text-white bg-linear-to-br from-gray-900 
    via-black to-gray-900"
      >
        Loading...
      </div>
    );
  }

  if (user.verificationStatus == "approved") {
    return (
      <div className="w-full min-h-screen pt-16">
        <VendorDashBoard />
      </div>
    );
  }

  // if (user.verificationStatus == "pending") {
  //   return (
  //     <div
  //       className="w-full min-h-screen flex items-center
  //       justify-center bg-linear-to-br from-gray-900 via-black
  //       to-gray-900 text-white px-4"
  //     >
  //       <div
  //         className="bg-white/10 backdrop-blur-md p-12
  //           rounded-2xl shadow-2xl border border-white/30
  //           max-w-2xl w-full text-center"
  //       >
  //         <h2 className="text-4xl font-bold mb-6 text-blue-400">
  //           Verification Pending ⏳
  //         </h2>
  //         <p className="text-gray-200 text-lg leading-relaxed">
  //           You can access vendor dashboard only after
  //           <span className="font-semibold"> admin verification </span>
  //         </p>
  //         <div className="mt-6 text-base text-gray-300">
  //           VerificationStatus:{" "}
  //           <span className="text-blue-400 font-semibold uppercase">
  //             {user.verificationStatus}
  //           </span>
  //         </div>
  //         <div className="mt-10 text-sm text-gray-400">
  //           It usually take 24-48 hour for admin verification{" "}
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }
  if (user.verificationStatus == "pending") {
    return (
      <div
        className="w-full min-h-screen flex items-center justify-center 
      bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-900 via-black to-slate-900 
      text-white px-4 font-sans"
      >
        {/* Decorative Glows */}
        <div className="absolute w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px] -top-48 -left-24 pointer-events-none"></div>
        <div className="absolute w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px] -bottom-24 -right-12 pointer-events-none"></div>

        <div
          className="relative bg-white/2 backdrop-blur-2xl p-10 md:p-16
        rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10
        max-w-2xl w-full text-center overflow-hidden"
        >
          {/* Animated Top Border Line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-linear-to-r from-transparent via-blue-500/50 to-transparent"></div>

          {/* Visual Icon Section */}
          <div className="mb-8 relative inline-flex">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse"></div>
            <div className="relative bg-black/40 border border-white/10 w-24 h-24 rounded-3xl flex items-center justify-center text-4xl shadow-2xl">
              <span className="animate-bounce">⏳</span>
            </div>
          </div>

          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight bg-clip-text text-transparent bg-linear-to-b from-white to-gray-500">
            Verification Pending
          </h2>

          <p className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-md mx-auto">
            You can access vendor dashboard only after
            <span className="text-blue-400 font-semibold shadow-blue-400/20">
              {" "}
              admin verification{" "}
            </span>
          </p>

          {/* Status Badge */}
          <div className="mt-8 inline-flex items-center gap-3 px-5 py-2 rounded-full bg-blue-500/5 border border-blue-500/20 group hover:border-blue-500/40 transition-colors">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span className="text-xs uppercase tracking-[0.2em] text-blue-400 font-bold">
              VerificationStatus: {user.verificationStatus}
            </span>
          </div>

          {/* Footer Info */}
          <div className="mt-12 pt-8 border-t border-white/5 space-y-2">
            <p className="text-sm text-gray-500 tracking-wide font-light">
              It usually take 24-48 hour for admin verification
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (user.verificationStatus == "rejected") {
    return (
      <div
        className="w-full min-h-screen flex items-center justify-center 
      bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-900 via-black to-slate-900 
      text-white px-4 font-sans"
      >
        {/* Decorative Glows */}
        <div className="absolute w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px] -top-48 -left-24 pointer-events-none"></div>
        <div className="absolute w-[400px] h-[400px] bg-rose-600/10 rounded-full blur-[100px] -bottom-24 -right-12 pointer-events-none"></div>

        <div
          className="relative bg-white/2 backdrop-blur-2xl p-10 md:p-16
        rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10
        max-w-2xl w-full text-center overflow-hidden"
        >
          {/* Animated Top Border Line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-linear-to-r from-transparent via-red-500/50 to-transparent"></div>

          {/* Visual Icon Section */}
          <div className="mb-8 relative inline-flex">
            <div className="absolute inset-0 bg-red-500/20 blur-3xl rounded-full animate-pulse"></div>
            <div className="relative bg-black/40 border border-white/10 w-24 h-24 rounded-3xl flex items-center justify-center text-4xl shadow-2xl">
              <span>❌</span>
            </div>
          </div>

          <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight bg-clip-text text-transparent bg-linear-to-b from-white to-gray-500">
            Application Rejected
          </h2>

          <p className="text-gray-400 text-lg md:text-xl leading-relaxed max-w-md mx-auto">
            Your vendor application has been
            <span className="text-red-400 font-semibold"> rejected </span>
            by the administrator
          </p>

          {/* Rejection Reason Box */}
          <div className="mt-8 mx-auto max-w-lg bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-left">
            <p className="text-xs uppercase tracking-[0.2em] text-red-400 font-bold mb-3">
              Rejection Reason
            </p>
            <p className="text-gray-300 text-sm leading-relaxed">
              {user.rejectedReason ||
                "No specific reason was provided. Please contact the admin for more details."}
            </p>
          </div>

          {/* Status Badge */}
          <div className="mt-8 inline-flex items-center gap-3 px-5 py-2 rounded-full bg-red-500/5 border border-red-500/20 group hover:border-red-500/40 transition-colors">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-xs uppercase tracking-[0.2em] text-red-400 font-bold">
              Status: {user.verificationStatus}
            </span>
          </div>

          {/* Action Buttons */}
          {!openVerifyform ? (
            <button
              onClick={() => setOpenVerifyform(true)}
              className="bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-lg font-semibold"
            >
              Verify Again
            </button>
          ) : (
            <div className="mt-6 text-left space-y-4">
              <input
                type="text"
                placeholder="Shop Name"
                className="w-full p-3 rounded bg-white/10 border border-white/20"
                onChange={(e) => setShopName(e.target.value)}
                value={shopName}
              />
              <input
                type="text"
                placeholder="Shop Address"
                className="w-full p-3 rounded bg-white/10 border border-white/20"
                onChange={(e) => setShopAddress(e.target.value)}
                value={shopAddress}
              />
              <input
                type="text"
                placeholder="Tax Number"
                className="w-full p-3 rounded bg-white/10 border border-white/20"
                onChange={(e) => setTaxNumber(e.target.value)}
                value={taxNumber}
              />

              <button
                disabled={loading}
                onClick={handleVerifyAgain}
                className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg font-semibold"
              >
                {loading ? (
                  <ClipLoader size={15} color="white" />
                ) : (
                  "Submit & Verify again"
                )}
              </button>
              <button
                onClick={() => setOpenVerifyform(false)}
                className="w-full bg-gray-600 hover:bg-gray-700 py-3 rounded-lg font-semibold"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Footer Info */}
          <div className="mt-8 space-y-2">
            <p className="text-sm text-gray-500 tracking-wide font-light">
              You can update your details and re-submit for verification
            </p>
          </div>
        </div>
      </div>
    );
  }
}

export default VendorPage;
