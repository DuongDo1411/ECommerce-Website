import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { duplicateKeyStatus, validateVoucherPayload } from "@/lib/voucher/validation";
import Voucher from "@/model/voucher.model";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ voucherId: string }> },
) {
  try {
    await connectDB();
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { voucherId } = await params;
    const voucher = await Voucher.findOne({ _id: voucherId, vendor: null }).lean();
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
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { voucherId } = await params;
    const payload = await req.json();

    if (payload.scope === "products") {
      return NextResponse.json(
        { message: "Voucher san chua ho tro theo san pham cu the" },
        { status: 400 },
      );
    }
    const existing = await Voucher.findOne({ _id: voucherId, vendor: null });
    if (!existing) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const validationError = validateVoucherPayload(payload, existing);
    if (validationError) {
      return NextResponse.json({ message: validationError }, { status: 400 });
    }
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
    existing.vendor = null;
    // Voucher sàn không theo sản phẩm cụ thể; chỉ all/category.
    if (existing.scope !== "category") existing.scope = "all";
    existing.applicableProducts = [];
    if (existing.scope !== "category") existing.applicableCategories = [];
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
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;
    const { voucherId } = await params;
    const voucher = await Voucher.findOneAndUpdate(
      { _id: voucherId, vendor: null },
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
