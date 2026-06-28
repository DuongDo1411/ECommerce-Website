import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { evaluateVoucherCandidates } from "@/lib/voucher/candidates";
import {
  buildQuoteContext,
  computeOrderQuote,
  recommendBestVouchers,
  VoucherSelection,
} from "@/lib/voucher/quote";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const base = {
      userId: session.user.id,
      items: body.items ?? [],
      addressId: body.addressId,
    };

    // Build ctx MỘT lần: dùng chung cho recommend + quote + candidates (1 lần gọi GHN).
    const ctx = await buildQuoteContext(base);

    const hasClientCodes =
      (Array.isArray(body.shopVoucherCodes) && body.shopVoucherCodes.length > 0) ||
      Boolean(body.platformVoucherCode) ||
      Boolean(body.freeshipVoucherCode);

    let selection: VoucherSelection = {
      shopVoucherCodes: body.shopVoucherCodes ?? [],
      platformVoucherCode: body.platformVoucherCode,
      freeshipVoucherCode: body.freeshipVoucherCode,
    };
    let recommended: VoucherSelection | undefined;

    // Chỉ tự gợi ý khi client yêu cầu và chưa tự chọn mã nào (lần đầu mở checkout).
    if (body.recommend && !hasClientCodes) {
      recommended = await recommendBestVouchers(base, ctx);
      selection = recommended;
    }

    const quote = await computeOrderQuote({ ...base, ...selection }, ctx);

    const candidates = body.includeCandidates
      ? await evaluateVoucherCandidates({ ...base, ...selection }, ctx)
      : undefined;

    return NextResponse.json({ quote, recommended, candidates }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Quote failed" },
      { status: 400 },
    );
  }
}
