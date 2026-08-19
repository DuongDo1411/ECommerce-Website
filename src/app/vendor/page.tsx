import { requireRole } from "@/lib/rbac";
import { isVendorProfileIncomplete } from "@/lib/vendorProfile";
import React from "react";
import EditVendorDetails from "../component/Vendor/EditVendorDetails";
import VendorPage from "../component/Vendor/VendorPage";
import Footer from "../component/Footer";
import Navbar from "../component/Navbar";

export default async function VendorDashboardPage() {
  const { user } = await requireRole(["vendor"]);

  // Chưa đủ hồ sơ thì vào form khai. Điều kiện dùng chung với trang `/` nên hai nơi không thể
  // lệch nhau, và nó bao gồm cả số điện thoại lấy hàng cùng toàn bộ cấu trúc địa chỉ GHN.
  if (isVendorProfileIncomplete(user)) {
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
