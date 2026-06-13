import { auth } from "@/auth";
import uploadOnCloudinary from "@/lib/cloudinary";
import { MAX_CHAT_IMAGE_SIZE } from "@/lib/chat";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Image file is required" },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { message: "Only image uploads are allowed" },
        { status: 400 },
      );
    }

    if (file.size > MAX_CHAT_IMAGE_SIZE) {
      return NextResponse.json(
        { message: "Image must be 5MB or smaller" },
        { status: 400 },
      );
    }

    const url = await uploadOnCloudinary(file);
    if (!url) {
      return NextResponse.json(
        { message: "Upload failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: `Failed to upload image: ${error}` },
      { status: 500 },
    );
  }
}
