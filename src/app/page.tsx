import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { redirect } from "next/navigation";
import React from "react";
import EditRole_Phone from "./component/EditRole_Phone";
import { div } from "motion/react-client";
import Navbar from "./component/Navbar";
import UserDashBoard from "./component/User/UserDashBoard";
import AdminDashBoard from "./component/Admin/AdminDashBoard";
import Footer from "./component/Footer";
import EditVendorDetails from "./component/Vendor/EditVendorDetails";
import VendorPage from "./component/Vendor/VendorPage";

export default async function Home() {
  await connectDB();
  const session = await auth();
  const user = await User.findById(session?.user?.id);
  if (!user) {
    redirect("/login");
  }
  const inComplete =
    !user.role || !user.phone || (!user.phone && user.role == "user");
  if (inComplete) {
    return <EditRole_Phone />;
  }
  if (user?.role == "vendor") {
    const isCompleteDetails =
      !user.shopName || !user.shopAddress || !user.taxNumber;
    if (isCompleteDetails) {
      return <EditVendorDetails />;
    }
  }
  const plainUser = JSON.parse(JSON.stringify(user));
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900
    font-sans flex-col"
    >
      <Navbar user={plainUser} />
      {user?.role == "user" ? (
        <UserDashBoard />
      ) : user?.role == "vendor" ? (
        <VendorPage user={plainUser} />
      ) : (
        <AdminDashBoard />
      )}
      <Footer user={plainUser} />
    </div>
  );
}
