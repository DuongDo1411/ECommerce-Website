import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { redirect } from "next/navigation";
import React, { Suspense } from "react";
import Navbar from "../component/Navbar";
import Footer from "../component/Footer";
import CategoryPageClient from "./CategoryPageClient";

export default async function CategoryPage() {
  await connectDB();
  const session = await auth();
  const user = await User.findById(session?.user?.id);
  if (!user) redirect("/login");

  const plainUser = JSON.parse(JSON.stringify(user));
  return (
    <div className="flex min-h-screen flex-col bg-linear-to-br from-gray-900 via-black to-gray-900 font-sans">
      <Navbar user={plainUser} />
      <main className="flex-1 pt-16">
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center text-gray-400 text-lg">
              Đang tải...
            </div>
          }
        >
          <CategoryPageClient />
        </Suspense>
      </main>
      <Footer user={plainUser} />
    </div>
  );
}
