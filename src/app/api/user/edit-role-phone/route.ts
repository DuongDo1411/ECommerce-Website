import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ROLES = ["user", "vendor", "admin"];

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { phone, role } = await req.json();

    const normalizedPhone = String(phone ?? "").trim();
    if (!/^0\d{9}$/.test(normalizedPhone)) {
      return NextResponse.json(
        {
          message:
            "So dien thoai khong hop le - phai gom 10 chu so va bat dau bang 0 (VD: 0901234567)",
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ message: "Invalid role" }, { status: 400 });
    }

    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (role === "admin") {
      const existingAdmin = await User.findOne({
        role: "admin",
        email: { $ne: session.user.email },
      });

      if (existingAdmin) {
        return NextResponse.json(
          { message: "Admin already exists" },
          { status: 403 },
        );
      }
    }

    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      { phone: normalizedPhone, role },
      { new: true },
    );

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 400 });
    }

    return NextResponse.json(
      { message: "Profile setup updated successfully", user },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Edit role and phone error ${error}` },
      { status: 500 },
    );
  }
}
