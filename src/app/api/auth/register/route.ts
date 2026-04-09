import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { name, email, password } = await req.json();

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { message: "Tên người dùng đã tồn tại" },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { message: "Mật khẩu phải có ít nhất 6 ký tự" },
        { status: 400 },
      );
    }
    const hassedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      password: hassedPassword,
    });
    return NextResponse.json(
      {
        user,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `register error ${error}` },
      { status: 500 },
    );
  }
}
