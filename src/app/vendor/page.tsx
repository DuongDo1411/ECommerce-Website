import { requireRole } from "@/lib/rbac";
import React from "react";
import EditVendorDetails from "../component/Vendor/EditVendorDetails";
import VendorPage from "../component/Vendor/VendorPage";
import Footer from "../component/Footer";
import Navbar from "../component/Navbar";

export default async function VendorDashboardPage() {
  const { user } = await requireRole(["vendor"]);

  const isCompleteDetails =
    !user.shopName ||
    !user.shopAddress ||
    !user.taxNumber ||
    !user.shopAddressDetail?.districtId ||
    !user.shopAddressDetail?.wardCode;

  if (isCompleteDetails) {
    return <EditVendorDetails />;
  }

  const plainUser = JSON.parse(JSON.stringify(user));

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900
    font-sans flex-col"
    >
      <Navbar user={plainUser} />
      <VendorPage user={plainUser} />
      <Footer user={plainUser} />
    </div>
  );
}
