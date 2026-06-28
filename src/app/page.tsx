import { getOptionalUser } from "@/lib/rbac";
import { redirect } from "next/navigation";
import React from "react";
import EditRole_Phone from "./component/EditRole_Phone";
import Navbar from "./component/Navbar";
import UserDashBoard from "./component/User/UserDashBoard";
import Footer from "./component/Footer";
import EditVendorDetails from "./component/Vendor/EditVendorDetails";

export default async function Home() {
  const ctx = await getOptionalUser();

  if (!ctx) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900
    font-sans flex-col"
      >
        <Navbar user={null} />
        <UserDashBoard />
        <Footer user={null} />
      </div>
    );
  }

  const { user } = ctx;
  const inComplete =
    !user.role || !user.phone || (!user.phone && user.role == "user");
  if (inComplete) {
    return <EditRole_Phone />;
  }
  if (user?.role == "vendor") {
    // Also require the GHN-structured pickup address; legacy vendors that
    // only have the old free-text shopAddress must (re)complete this form.
    const isCompleteDetails =
      !user.shopName ||
      !user.shopAddress ||
      !user.taxNumber ||
      !user.shopAddressDetail?.districtId ||
      !user.shopAddressDetail?.wardCode;
    if (isCompleteDetails) {
      return <EditVendorDetails />;
    }

    redirect("/vendor");
  }
  if (user?.role == "admin") {
    redirect("/admin");
  }

  const plainUser = JSON.parse(JSON.stringify(user));
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900
    font-sans flex-col"
    >
      <Navbar user={plainUser} />
      <UserDashBoard />
      <Footer user={plainUser} />
    </div>
  );
}
