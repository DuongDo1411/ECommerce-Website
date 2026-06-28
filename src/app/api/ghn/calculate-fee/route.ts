import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import {
  computeFeesByVendor,
  GHNError,
} from "@/lib/ghn";
import User from "@/model/user.model";
import type { AddressSubdoc } from "@/types/address";
import { NextRequest, NextResponse } from "next/server";

// Body: { addressId, items: [{ productId, quantity }] }
// Groups items by vendor, computes a GHN fee per vendor, returns the sum.
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { addressId, items } = await req.json();
    if (!addressId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: "addressId and items are required" },
        { status: 400 },
      );
    }

    const user = await User.findOne({ email: session.user.email });
    const address = user?.addresses?.find(
      (a: AddressSubdoc) => a._id.toString() === addressId.toString(),
    );
    if (!address) {
      return NextResponse.json(
        { message: "Địa chỉ giao hàng không tồn tại" },
        { status: 404 },
      );
    }

    const { feesByVendor, totalFee } = await computeFeesByVendor(address, items);
    return NextResponse.json({ feesByVendor, totalFee }, { status: 200 });
  } catch (error) {
    const status = error instanceof GHNError ? error.code : 500;
    const msg =
      error instanceof GHNError
        ? error.message
        : `GHN calculate-fee error ${error}`;
    return NextResponse.json({ message: msg }, { status });
  }
}
