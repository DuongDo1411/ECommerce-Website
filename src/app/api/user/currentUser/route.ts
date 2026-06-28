import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ user: null }, { status: 200 });
    }
    const user = await User.findOne({ email: session.user.email }).lean();
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 400 });
    }

    const { password, ...safeUser } = user;
    return NextResponse.json(
      { user: { ...safeUser, hasPassword: !!password } },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `get currentUser error ${error}` },
      { status: 500 },
    );
  }
}
