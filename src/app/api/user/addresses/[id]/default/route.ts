import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import type { AddressSubdoc } from "@/types/address";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/user/addresses/[id]/default — set this address as the only default
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    let found = false;
    (user.addresses ?? []).forEach((a: AddressSubdoc) => {
      const isThis = a._id.toString() === id;
      a.isDefault = isThis;
      if (isThis) found = true;
    });
    if (!found) {
      return NextResponse.json(
        { message: "Địa chỉ không tồn tại" },
        { status: 404 },
      );
    }
    await user.save();

    return NextResponse.json(
      { message: "Đã đặt làm địa chỉ mặc định", addresses: user.addresses },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}
