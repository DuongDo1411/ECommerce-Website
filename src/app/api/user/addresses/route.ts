import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import User from "@/model/user.model";
import type { AddressSubdoc } from "@/types/address";
import { NextRequest, NextResponse } from "next/server";

// GET /api/user/addresses — list all saved addresses
export async function GET() {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const user = await User.findById(session.user.id).select("addresses");
    return NextResponse.json(
      { addresses: user?.addresses ?? [] },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}

const REQUIRED = [
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

// POST /api/user/addresses — add a new address
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    for (const f of REQUIRED) {
      if (body[f] === undefined || body[f] === "" || body[f] === null) {
        return NextResponse.json(
          { message: `Thiếu trường ${f}` },
          { status: 400 },
        );
      }
    }

    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    if (!user.addresses) user.addresses = [];

    // First address (or explicit flag) becomes default; clear others if so.
    const makeDefault = user.addresses.length === 0 || body.isDefault === true;
    if (makeDefault) {
      user.addresses.forEach((a: AddressSubdoc) => (a.isDefault = false));
    }

    user.addresses.push({
      label: body.label ?? "",
      fullName: body.fullName,
      phone: body.phone,
      provinceId: body.provinceId,
      provinceName: body.provinceName,
      districtId: body.districtId,
      districtName: body.districtName,
      wardCode: String(body.wardCode),
      wardName: body.wardName,
      addressDetail: body.addressDetail,
      isDefault: makeDefault,
    });
    await user.save();

    return NextResponse.json(
      { message: "Đã thêm địa chỉ", addresses: user.addresses },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json({ message: `Error: ${error}` }, { status: 500 });
  }
}
