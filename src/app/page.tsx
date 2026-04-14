import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { redirect } from "next/navigation";
import React from "react";
import EditRole_Phone from "./component/EditRole_Phone";

export default async function Home() {
  await connectDB();
  const session = await auth();
  const user = await User.findById(session?.user?.id);
  if (!user) {
    redirect("/login");
  }
  const inComplete = !user.role || !user.phone || (!user.phone && user.role == "user");
  if(inComplete){
    return <EditRole_Phone/>
  }
  return <div></div>;
}
