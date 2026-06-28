import { requireRole } from "@/lib/rbac";
import React from "react";
import AdminDashBoard from "../component/Admin/AdminDashBoard";
import Footer from "../component/Footer";
import Navbar from "../component/Navbar";

export default async function AdminPage() {
  const { user } = await requireRole(["admin"]);
  const plainUser = JSON.parse(JSON.stringify(user));

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-900 via-black to-gray-900
    font-sans flex-col"
    >
      <Navbar user={plainUser} />
      <AdminDashBoard />
      <Footer user={plainUser} />
    </div>
  );
}
