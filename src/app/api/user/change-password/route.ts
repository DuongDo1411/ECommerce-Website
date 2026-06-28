import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized User" }, { status: 400 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { message: "Vui lòng nhập đầy đủ mật khẩu" },
        { status: 400 },
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { message: "Mật khẩu mới phải có ít nhất 6 ký tự" },
        { status: 400 },
      );
    }

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 400 });
    }
    if (!user.password) {
      return NextResponse.json(
        {
          message:
            "Tài khoản liên kết Google, mật khẩu do Google quản lý.",
        },
        { status: 400 },
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json(
        { message: "Mật khẩu hiện tại không đúng" },
        { status: 400 },
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return NextResponse.json(
      { message: "Đổi mật khẩu thành công" },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `change password error ${error}` },
      { status: 500 },
    );
  }
}
