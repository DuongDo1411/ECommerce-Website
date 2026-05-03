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
    const file = formData.get("image") as File | null;

    if (!name || !phone) {
      return NextResponse.json(
        { message: "Name and Phone are required" },
        { status: 400 },
      );
    }
    let imageUrl;
    if (file) {
      imageUrl = await uploadOnCloudinary(file);
    }

    const updatedUser = await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $set: {
          name,
          phone,
          image: imageUrl,
        },
      },
      { new: true },
    );
    if (!updatedUser) {
      return NextResponse.json({ message: "User not found" }, { status: 400 });
    }
    return NextResponse.json(updatedUser, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: `Edit user profile error ${error}`,
      },
      { status: 500 },
    );
  }
}
