import { auth } from "@/auth";
import uploadOnCloudinary from "@/lib/cloudinary";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session || !session.user?.email || !session.user.id) {
      return NextResponse.json(
        { message: "Unauthorized User" },
        { status: 400 },
      );
    }
    const formData = await req.formData();
    const name = formData.get("name") as string;
    const phone = formData.get("phone") as string;
    const gender = formData.get("gender") as string | null;
    const file = formData.get("image") as File | null;

    if (!name || !phone) {
      return NextResponse.json(
        { message: "Name and Phone are required" },
        { status: 400 },
      );
    }
    if (!/^0\d{9}$/.test(phone.trim())) {
      return NextResponse.json(
        {
          message:
            "Số điện thoại không hợp lệ — phải gồm 10 chữ số và bắt đầu bằng 0 (VD: 0901234567)",
        },
        { status: 400 },
      );
    }
    let imageUrl;
    if (file) {
      imageUrl = await uploadOnCloudinary(file);
    }

    const $set: Record<string, string | undefined> = {
      name,
      phone,
    };
    if (gender === "male" || gender === "female") {
      $set.gender = gender;
    }
    if (imageUrl) {
      $set.image = imageUrl;
    }

    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set,
      },
      { new: true },
    );
    if (!updatedUser) {
      return NextResponse.json({ message: "User not found" }, { status: 400 });
    }

    const userObject = updatedUser.toObject();
    const { password, ...safeUser } = userObject;
    return NextResponse.json(
      { ...safeUser, hasPassword: !!password },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: `Edit user profile error ${error}`,
      },
      { status: 500 },
    );
  }
}
