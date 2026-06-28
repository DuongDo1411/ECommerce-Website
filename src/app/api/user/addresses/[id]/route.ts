import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import type { AddressSubdoc } from "@/types/address";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/user/addresses/[id] — edit an address
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = await req.json();

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    const addr = user.addresses?.find(
      (a: AddressSubdoc) => a._id.toString() === id,
    );
    if (!addr) {
      return NextResponse.json(
        { message: "Địa chỉ không tồn tại" },
        { status: 404 },
      );
    }

    const fields = [
      "label",
      "fullName",
      "phone",
      "provinceId",
      "provinceName",
      "districtId",
      "districtName",
      "wardCode",
      "wardName",
      "addressDetail",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) {
        addr[f] = f === "wardCode" ? String(body[f]) : body[f];
      }
    }
    await user.save();

    return NextResponse.json(
      { message: "Đã cập nhật địa chỉ", addresses: user.addresses },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}

// DELETE /api/user/addresses/[id]
export async function DELETE(
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
    const wasDefault = user.addresses?.find(
      (a: AddressSubdoc) => a._id.toString() === id,
    )?.isDefault;

    user.addresses = (user.addresses ?? []).filter(
      (a: AddressSubdoc) => a._id.toString() !== id,
    );
    // If the default was removed, promote the first remaining address.
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }
    await user.save();

    return NextResponse.json(
      { message: "Đã xóa địa chỉ", addresses: user.addresses },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}
