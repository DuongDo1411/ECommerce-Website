import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { duplicateKeyStatus, validateVoucherPayload } from "@/lib/voucher/validation";
import Product from "@/model/product.model";
import Voucher from "@/model/voucher.model";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateVendorPayload(payload: any, vendorId: string, existing?: any) {
  if (payload.discountType === "freeship") {
    return "Nha ban hang chua ho tro tao voucher freeship";
  }
  const baseError = validateVoucherPayload(payload, existing);
  if (baseError) return baseError;
  if (payload.scope === "products" && Array.isArray(payload.applicableProducts)) {
    const count = await Product.countDocuments({
      _id: { $in: payload.applicableProducts },
      vendor: vendorId,
    });
    if (count !== payload.applicableProducts.length) {
      return "San pham ap dung khong thuoc shop cua ban";
    }
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ voucherId: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { voucherId } = await params;
    const voucher = await Voucher.findOne({
      _id: voucherId,
      vendor: authz.session.user.id,
    }).lean();
    if (!voucher) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json({ voucher }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Khong the tai voucher" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ voucherId: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { voucherId } = await params;
    const payload = await req.json();
    const existing = await Voucher.findOne({
      _id: voucherId,
      vendor: authz.session.user.id,
    });
    if (!existing) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const error = await validateVendorPayload(payload, authz.session.user.id, existing);
    if (error) return NextResponse.json({ message: error }, { status: 400 });
    if (
      typeof payload.totalQuota === "number" &&
      payload.totalQuota < existing.usedQuota
    ) {
      return NextResponse.json(
        { message: "Khong the ha quota thap hon so da dung" },
        { status: 400 },
      );
    }

    const allowed = [
      "code",
      "title",
      "description",
      "discountType",
      "discountValue",
      "maxDiscount",
      "minSpend",
      "totalQuota",
      "scope",
      "applicableProducts",
      "applicableCategories",
      "collectStartAt",
      "startAt",
      "endAt",
      "isActive",
    ];
    for (const key of allowed) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (payload[key] !== undefined) (existing as any)[key] = payload[key];
    }
    existing.perUserLimit = 1;
    await existing.save();

    return NextResponse.json({ voucher: existing }, { status: 200 });
  } catch (error) {
    const status = duplicateKeyStatus(error);
    const message = status === 409 ? "Ma voucher da ton tai" : "Update voucher failed";
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ voucherId: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { voucherId } = await params;
    const voucher = await Voucher.findOneAndUpdate(
      { _id: voucherId, vendor: authz.session.user.id },
      { isActive: false },
      { new: true },
    );
    if (!voucher) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json({ voucher }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Khong the xoa voucher" }, { status: 500 });
  }
}
