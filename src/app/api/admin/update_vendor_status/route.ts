import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { VENDOR_CODES } from "@/lib/vendorGate";
import { isVendorProfileComplete } from "@/lib/vendorProfile";
import User from "@/model/user.model";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

const STATUSES = new Set(["approved", "rejected"]);

/**
 * Duyệt hoặc từ chối hồ sơ nhà bán.
 *
 * Ghi bằng một `findOneAndUpdate` có điều kiện đồng thời thay vì đọc rồi `save()`. Hai chuyện
 * thật xảy ra ở khoảng giữa: nhà bán sửa hồ sơ sau khi quản trị viên đã mở hộp thoại, và hai
 * quản trị viên xử lý cùng một hồ sơ. Với `save()`, cả hai đều ghi thành công và bên sau đè lên
 * bên trước — quản trị viên duyệt một bản hồ sơ họ chưa từng xem.
 *
 * `updatedAt` làm thẻ phiên bản. Nó được API danh sách trả về cùng hồ sơ và gửi lại ở đây.
 */
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const authz = await requireRole(["admin"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;

    const { vendorId, status, rejectedReason, expectedUpdatedAt } =
      await req.json();
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

    const expected = new Date(expectedUpdatedAt);
    if (Number.isNaN(expected.getTime())) {
      return NextResponse.json(
        {
          message:
            "Thiếu expectedUpdatedAt — hãy tải lại danh sách hồ sơ rồi thử lại.",
        },
        { status: 400 },
      );
    }

    // Chỉ hồ sơ đang chờ mới được xử lý. "draft" là nhà bán đã kích hoạt nhưng chưa gửi hồ sơ
    // nào, nên chưa có gì để duyệt; duyệt một hồ sơ như vậy sẽ mở bán một cửa hàng không có
    // địa chỉ lấy hàng cho GHN.
    const vendor = await User.findOne({
      _id: vendorId,
      role: "vendor",
      verificationStatus: "pending",
    }).select(
      "phone shopName shopAddress taxNumber shopAddressDetail verificationStatus",
    );
    if (!vendor) {
      return NextResponse.json(
        { message: "Không tìm thấy hồ sơ nhà bán đang chờ duyệt" },
        { status: 404 },
      );
    }

    // Kiểm lại hồ sơ ở phía server trước khi mở bán. Danh sách mà quản trị viên bấm vào có thể
    // đã cũ, và nhà bán có thể đã xoá một trường kể từ lúc đó.
    if (status === "approved" && !isVendorProfileComplete(vendor)) {
      return NextResponse.json(
        {
          code: VENDOR_CODES.invalidTransition,
          message: "Hồ sơ chưa đầy đủ hoặc số điện thoại không hợp lệ, không thể duyệt.",
        },
        { status: 409 },
      );
    }

    const update =
      status === "approved"
        ? {
            $set: {
              verificationStatus: "approved" as const,
              isApproved: true,
              approvedAt: new Date(),
            },
            $unset: { rejectedReason: "" },
          }
        : {
            $set: {
              verificationStatus: "rejected" as const,
              isApproved: false,
              rejectedReason:
                (typeof rejectedReason === "string" && rejectedReason.trim()) ||
                "Hồ sơ của bạn đã bị từ chối. Vui lòng liên hệ quản trị viên.",
            },
          };

    const updated = await User.findOneAndUpdate(
      {
        _id: vendorId,
        role: "vendor",
        verificationStatus: "pending",
        updatedAt: expected,
      },
      update,
      { returnDocument: "after" },
    ).select("_id verificationStatus isApproved updatedAt");

    // Không khớp nghĩa là hồ sơ đã đổi giữa lúc đọc ở trên và lúc ghi: nhà bán vừa gửi lại,
    // hoặc một quản trị viên khác vừa xử lý xong. Hai lượt xử lý đồng thời thì đúng một lượt
    // đi qua được đây.
    if (!updated) {
      return NextResponse.json(
        {
          code: VENDOR_CODES.profileChanged,
          message:
            "Hồ sơ đã thay đổi kể từ lúc bạn mở. Vui lòng tải lại danh sách và xem lại.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        message: "Cập nhật trạng thái vendor thành công",
        vendorId: String(updated._id),
        status: updated.verificationStatus,
        updatedAt: updated.updatedAt?.toISOString() ?? null,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `Update vendor status error ${error}` },
      { status: 500 },
    );
  }
}
