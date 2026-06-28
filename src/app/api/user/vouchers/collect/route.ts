import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import UserVoucher from "@/model/userVoucher.model";
import Voucher from "@/model/voucher.model";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { voucherId } = await req.json();
    if (!voucherId) {
      return NextResponse.json({ message: "voucherId is required" }, { status: 400 });
    }
    if (!mongoose.Types.ObjectId.isValid(voucherId)) {
      return NextResponse.json({ message: "voucherId khong hop le" }, { status: 400 });
    }

    const now = new Date();
    const voucher = await Voucher.findOne({
      _id: voucherId,
      isActive: true,
      endAt: { $gte: now },
      $or: [{ collectStartAt: { $exists: false } }, { collectStartAt: { $lte: now } }],
      $expr: { $lt: ["$usedQuota", "$totalQuota"] },
    });

    if (!voucher) {
      return NextResponse.json(
        { message: "Voucher khong kha dung" },
        { status: 404 },
      );
    }

    const existing = await UserVoucher.findOne({
      user: session.user.id,
      voucher: voucher._id,
    })
      .select("status")
      .lean();

    if (existing) {
      const statusMessages: Record<string, string> = {
        collected: "Voucher da duoc luu",
        reserved: "Voucher dang duoc giu cho don hang khac",
        used: "Voucher da duoc su dung",
        expired: "Voucher da het han",
      };
      return NextResponse.json(
        {
          message: statusMessages[existing.status] ?? "Voucher da nam trong vi",
          status: existing.status,
        },
        { status: 409 },
      );
    }

    try {
      await UserVoucher.create({
        user: session.user.id,
        voucher: voucher._id,
        status: "collected",
        collectedAt: now,
      });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error?.code === 11000) {
        return NextResponse.json({ message: "Voucher da duoc luu" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ message: "Da luu voucher" }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "Khong the luu voucher" },
      { status: 500 },
    );
  }
}
