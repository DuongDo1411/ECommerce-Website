import connectDB from "@/lib/connectDB";
import {
  releaseStaleCodOrders,
  releaseStaleVnpayOrders,
} from "@/lib/voucher/lifecycle";
import { NextRequest, NextResponse } from "next/server";

function positiveNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const vnpayMinutes = positiveNumber(
      req.nextUrl.searchParams.get("vnpayMinutes"),
      15,
    );
    const codHours = positiveNumber(req.nextUrl.searchParams.get("codHours"), 48);

    const vnpay = await releaseStaleVnpayOrders(vnpayMinutes);
    const cod = await releaseStaleCodOrders(codHours);

    return NextResponse.json(
      { vnpay, cod, thresholds: { vnpayMinutes, codHours } },
      { status: 200 },
    );
  } catch (error) {
    console.error("[cron] release-stale-orders failed", error);
    return NextResponse.json({ message: "Cron failed" }, { status: 500 });
  }
}
