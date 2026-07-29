import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import User from "@/model/user.model";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const STATUSES = new Set(["approved", "rejected"]);

export async function POST(req: NextRequest) {
    try {
        await connectDB();
        const authz = await requireRole(["admin"], { mode: "api" });
        if (authz instanceof NextResponse) return authz;

        const { vendorId, status, rejectedReason } = await req.json();
        if (
            typeof vendorId !== "string" ||
            !mongoose.isValidObjectId(vendorId) ||
            !STATUSES.has(status)
        ) {
            return NextResponse.json(
                { message: "Vendor ID và trạng thái (approved|rejected) là bắt buộc" },
                { status: 400 },
            );
        }

        // Only act on accounts that are actually vendors — never flip role here.
        const vendor = await User.findOne({ _id: vendorId, role: "vendor" });
        if (!vendor) {
            return NextResponse.json({ message: "Vendor not found" }, { status: 404 });
        }

        if (status === "approved") {
            vendor.verificationStatus = "approved";
            vendor.isApproved = true;
            vendor.approvedAt = new Date();
            vendor.rejectedReason = undefined;
        } else {
            vendor.verificationStatus = "rejected";
            vendor.isApproved = false;
            vendor.rejectedReason =
                (typeof rejectedReason === "string" && rejectedReason.trim()) ||
                "Hồ sơ của bạn đã bị từ chối. Vui lòng liên hệ quản trị viên.";
        }

        await vendor.save();

        // Narrow response — never serialize the full user document.
        return NextResponse.json(
            {
                message: "Cập nhật trạng thái vendor thành công",
                vendorId: String(vendor._id),
                status: vendor.verificationStatus,
            },
            { status: 200 },
        );
    } catch (error) {
        return NextResponse.json(
            { message: `Vendor status update error ${error}` },
            { status: 500 },
        );
    }
}
