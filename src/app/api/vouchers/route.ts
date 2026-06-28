import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import Product from "@/model/product.model";
import UserVoucher from "@/model/userVoucher.model";
import Voucher from "@/model/voucher.model";
import {
  buildPublicSort,
  buildSearchFilter,
  buildSlotFilter,
  paginationMeta,
  parsePagination,
} from "@/lib/voucher/query";
import mongoose, { type PipelineStage } from "mongoose";
import { NextRequest, NextResponse } from "next/server";

type WalletStatus = "collected" | "reserved" | "used" | "expired";
type PublicVoucherLean = {
  _id: { toString(): string };
  [key: string]: unknown;
};
type WalletLeanRow = {
  voucher: { toString(): string };
  status: WalletStatus;
};

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    const now = new Date();
    const scope = req.nextUrl.searchParams.get("scope");
    const vendor = req.nextUrl.searchParams.get("vendor");
    const productId = req.nextUrl.searchParams.get("productId");
    const slot = req.nextUrl.searchParams.get("slot");
    const q = req.nextUrl.searchParams.get("q");
    const sortParam = req.nextUrl.searchParams.get("sort");
    const { page, limit, skip } = parsePagination(
      req.nextUrl.searchParams.get("page"),
      req.nextUrl.searchParams.get("limit"),
      { defaultLimit: 24, maxLimit: 50 },
    );
    const sort = buildPublicSort(sortParam);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const andConditions: any[] = [
      { isActive: true },
      { endAt: { $gte: now } },
      {
        $or: [
          { collectStartAt: { $exists: false } },
          { collectStartAt: { $lte: now } },
        ],
      },
    ];

    if (scope === "platform") {
      andConditions.push({ vendor: null });
    } else if (vendor) {
      if (!mongoose.Types.ObjectId.isValid(vendor)) {
        return NextResponse.json({ message: "vendor khong hop le" }, { status: 400 });
      }
      andConditions.push({ vendor });
    }

    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return NextResponse.json({ message: "productId khong hop le" }, { status: 400 });
      }
      const product = await Product.findById(productId).select("vendor category").lean();
      if (product) {
        andConditions.push({ $or: [{ vendor: null }, { vendor: product.vendor }] });
        // Chỉ trả voucher thực sự áp dụng cho sản phẩm này theo scope.
        andConditions.push({
          $or: [
            { scope: "all" },
            { scope: "products", applicableProducts: productId },
            { scope: "category", applicableCategories: product.category },
          ],
        });
      } else {
        return NextResponse.json(
          { vouchers: [], pagination: paginationMeta(0, page, limit) },
          { status: 200 },
        );
      }
    }

    const slotCond = buildSlotFilter(slot);
    if (Object.keys(slotCond).length > 0) andConditions.push(slotCond);
    const searchCond = buildSearchFilter(q);
    if (Object.keys(searchCond).length > 0) andConditions.push(searchCond);

    const filter = { $and: andConditions };
    const bestValuePipeline: PipelineStage[] = [
      { $match: filter },
      {
        $addFields: {
          _bestValueNoMin: {
            $cond: [{ $lte: [{ $ifNull: ["$minSpend", 0] }, 0] }, 0, 1],
          },
          _bestValueAmount: {
            $cond: [
              { $in: ["$discountType", ["percentage", "freeship"]] },
              { $ifNull: ["$maxDiscount", "$discountValue"] },
              "$discountValue",
            ],
          },
          _bestValueMinSpend: { $ifNull: ["$minSpend", 0] },
        },
      },
      {
        $sort: {
          _bestValueNoMin: 1,
          _bestValueAmount: -1,
          _bestValueMinSpend: 1,
          endAt: 1,
          createdAt: -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _bestValueNoMin: 0,
          _bestValueAmount: 0,
          _bestValueMinSpend: 0,
        },
      },
    ];
    const [vouchers, total] = await Promise.all([
      sortParam === "bestValue"
        ? Voucher.aggregate<PublicVoucherLean>(bestValuePipeline)
        : Voucher.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean<PublicVoucherLean[]>(),
      Voucher.countDocuments(filter),
    ]);

    let walletStatusByVoucher = new Map<string, WalletStatus>();
    if (session?.user?.id) {
      const wallet = await UserVoucher.find({ user: session.user.id })
        .select("voucher status")
        .lean<WalletLeanRow[]>();
      walletStatusByVoucher = new Map(
        wallet.map((row) => [row.voucher.toString(), row.status]),
      );
    }

    return NextResponse.json(
      {
        vouchers: vouchers.map((voucher) => {
          const walletStatus = walletStatusByVoucher.get(voucher._id.toString());
          return {
            ...voucher,
            collected: walletStatus === "collected",
            walletStatus,
          };
        }),
        pagination: paginationMeta(total, page, limit),
      },
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
