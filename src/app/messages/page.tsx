import { auth } from "@/auth";
import Footer from "@/app/component/Footer";
import Navbar from "@/app/component/Navbar";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { redirect } from "next/navigation";
import MessagesClient from "./MessagesClient";

export default async function MessagesPage() {
  await connectDB();
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await User.findById(session.user.id).select("-password");
  if (!user) {
    redirect("/login");
  }

  const plainUser = JSON.parse(JSON.stringify(user));

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-gray-950 to-black text-white">
      <Navbar user={plainUser} />
      <main className="min-h-screen pt-20">
        <MessagesClient currentUserId={String(user._id)} />
      </main>
      <Footer user={plainUser} />
    </div>
  );
}
