import uploadOnCloudinary from "@/lib/cloudinary";
import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import User from "@/model/user.model";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { session } = authz;

    const formData = await req.formData();
    const logoFile = formData.get("logo") as Blob | null;
    const bgFile = formData.get("background") as Blob | null;

    if (!logoFile && !bgFile) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    const updates: Record<string, string> = {};

    if (logoFile) {
      const url = await uploadOnCloudinary(logoFile);
      if (url) updates.image = url;
    }

    if (bgFile) {
      const url = await uploadOnCloudinary(bgFile);
      if (url) updates.shopBackground = url;
    }

    const user = await User.findByIdAndUpdate(session.user.id, updates, { new: true });
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        image: user.image,
        shopBackground: (user as { shopBackground?: string }).shopBackground,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ message: `Shop appearance update error: ${error}` }, { status: 500 });
  }
}
