import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import {
  buildManagerSort,
  buildSearchFilter,
  buildStateFilter,
  paginationMeta,
  parsePagination,
} from "@/lib/voucher/query";
import { buildVoucherStats, emptyStats } from "@/lib/voucher/stats";
import { duplicateKeyStatus, validateVoucherPayload } from "@/lib/voucher/validation";
import Product from "@/model/product.model";
import Voucher from "@/model/voucher.model";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function validateVendorPayload(payload: any, vendorId: string) {
  if (payload.discountType === "freeship") {
    return "Nha ban hang chua ho tro tao voucher freeship";
  }
  const baseError = validateVoucherPayload(payload);
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

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;

    const params = req.nextUrl.searchParams;
    const { page, limit, skip } = parsePagination(
      params.get("page"),
      params.get("limit"),
      { defaultLimit: 24, maxLimit: 50 },
    );
    const sort = buildManagerSort(params.get("sort"));

    const conditions: Record<string, unknown>[] = [{ vendor: authz.session.user.id }];
    const stateCond = buildStateFilter(params.get("state"));
    if (Object.keys(stateCond).length > 0) conditions.push(stateCond);
    const searchCond = buildSearchFilter(params.get("q"));
    if (Object.keys(searchCond).length > 0) conditions.push(searchCond);
    const filter = { $and: conditions };

    const [vouchers, total] = await Promise.all([
      Voucher.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Voucher.countDocuments(filter),
    ]);
    const stats = await buildVoucherStats(vouchers.map((v) => String(v._id)));
    const withStats = vouchers.map((v) => ({
      ...v,
      stats: stats.get(String(v._id)) ?? emptyStats(),
    }));
    return NextResponse.json(
      { vouchers: withStats, pagination: paginationMeta(total, page, limit) },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Khong the tai voucher" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;

    const payload = await req.json();
    const error = await validateVendorPayload(payload, authz.session.user.id);
    if (error) return NextResponse.json({ message: error }, { status: 400 });

    const voucher = await Voucher.create({
      code: payload.code,
      title: payload.title,
      description: payload.description,
      discountType: payload.discountType,
      discountValue: payload.discountValue,
      maxDiscount: payload.maxDiscount,
      minSpend: payload.minSpend ?? 0,
      totalQuota: payload.totalQuota,
      usedQuota: 0,
      perUserLimit: 1,
      scope: payload.scope ?? "all",
      applicableProducts: payload.applicableProducts ?? [],
      applicableCategories: payload.applicableCategories ?? [],
      collectStartAt: payload.collectStartAt ? new Date(payload.collectStartAt) : new Date(),
      startAt: new Date(payload.startAt),
      endAt: new Date(payload.endAt),
      isActive: payload.isActive ?? true,
      vendor: authz.session.user.id,
      createdBy: authz.session.user.id,
    });

    return NextResponse.json({ voucher }, { status: 201 });
  } catch (error) {
    const status = duplicateKeyStatus(error);
    const message = status === 409 ? "Ma voucher da ton tai" : "Create voucher failed";
    return NextResponse.json({ message }, { status });
  }
}
