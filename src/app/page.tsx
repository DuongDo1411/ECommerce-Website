import { getOptionalUser } from "@/lib/rbac";
import { isVendorProfileIncomplete } from "@/lib/vendorProfile";
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

  // Nhà bán được xử lý TRƯỚC form số điện thoại chung. Nhà bán vừa kích hoạt chưa có `phone`,
  // nên nếu kiểm `phone` trước thì họ bị đẩy vào form của người mua và không bao giờ tới được
  // nơi khai hồ sơ cửa hàng — nơi duy nhất nhận số điện thoại lấy hàng.
  if (user.role === "vendor") {
    if (isVendorProfileIncomplete(user)) {
      return <EditVendorDetails />;
    }
    redirect("/vendor");
  }

  if (user.role === "admin") {
    redirect("/admin");
  }

  if (!user.role || !user.phone) {
    return <EditRole_Phone />;
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
