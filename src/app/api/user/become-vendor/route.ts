import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { apiErrorMessage } from "@/lib/apiError";
import { readLimitedJsonBody } from "@/lib/security/requestBody";
import { noStoreJson } from "@/lib/security/response";
import {
  disconnectUserSockets,
  revokeAccountSecurity,
} from "@/lib/security/session";
import User from "@/model/user.model";

const MAX_BODY_BYTES = 8 * 1024;
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/**
 * "Open a shop": the ONLY path a plain user can request vendor status. The role
 * transition is one-way and server-controlled — the client never supplies role,
 * isApproved or verificationStatus. The account lands as a pending vendor and an
 * admin must approve it before it can sell.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return noStoreJson({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const user = await User.findById(session.user.id).select(
      "+password role phone",
    );
    if (!user) {
      return noStoreJson({ message: "Unauthorized" }, { status: 401 });
    }
    // Only a password-based plain user may open a shop. Google-only accounts
    // (no password), existing vendors and admins are rejected.
    if (user.role !== "user" || typeof user.password !== "string") {
      return noStoreJson(
        { message: "Tài khoản này không thể đăng ký bán hàng." },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await readLimitedJsonBody(req, MAX_BODY_BYTES);
    } catch (parseError) {
      return noStoreJson(
        {
          message:
            parseError instanceof RangeError
              ? "Dữ liệu quá lớn."
              : "Dữ liệu không hợp lệ.",
        },
        { status: parseError instanceof RangeError ? 413 : 400 },
      );
    }
    const b = (body ?? {}) as Record<string, unknown>;

    const phone = clean(b.phone, 20) || (user.phone ?? "");
    if (!/^0\d{9}$/.test(phone)) {
      return noStoreJson(
        { message: "Số điện thoại không hợp lệ — 10 chữ số, bắt đầu bằng 0." },
        { status: 400 },
      );
    }

    const shopName = clean(b.shopName, 120);
    const taxNumber = clean(b.taxNumber, 50);
    const detail = (b.shopAddressDetail ?? {}) as Record<string, unknown>;
    const address = clean(detail.address, 255);
    const wardCode = clean(detail.wardCode, 30);
    const wardName = clean(detail.wardName, 120);
    const districtName = clean(detail.districtName, 120);
    const provinceName = clean(detail.provinceName, 120);
    const districtId = Number(detail.districtId);
    const provinceId = Number(detail.provinceId);

    if (!shopName || !taxNumber) {
      return noStoreJson(
        { message: "Tên cửa hàng và mã số thuế là bắt buộc." },
        { status: 400 },
      );
    }
    if (
      !address ||
      !wardCode ||
      !wardName ||
      !districtName ||
      !provinceName ||
      !Number.isInteger(districtId) ||
      districtId <= 0 ||
      !Number.isInteger(provinceId) ||
      provinceId <= 0
    ) {
      return noStoreJson(
        {
          message:
            "Vui lòng chọn đầy đủ Tỉnh/Thành phố, Quận/Huyện, Phường/Xã và nhập địa chỉ chi tiết.",
        },
        { status: 400 },
      );
    }

    const shopAddressDetail = {
      address,
      wardCode,
      wardName,
      districtId,
      districtName,
      provinceId,
      provinceName,
    };
    const shopAddress = `${address}, ${wardName}, ${districtName}, ${provinceName}`;

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Guard on role:"user" so a concurrent change can't be overwritten, and
        // never trust client-supplied role/approval fields.
        const result = await User.updateOne(
          { _id: user._id, role: "user" },
          {
            $set: {
              role: "vendor",
              isApproved: false,
              verificationStatus: "pending",
              requestedAt: new Date(),
              phone,
              shopName,
              taxNumber,
              shopAddress,
              shopAddressDetail,
            },
            $unset: { rejectedReason: "", approvedAt: "" },
          },
          { session: dbSession },
        );
        if (result.matchedCount !== 1) throw new Error("role_conflict");
        // Force a fresh login so the session re-establishes with the new role.
        await revokeAccountSecurity(user._id.toString(), {
          session: dbSession,
        });
      });
    } finally {
      await dbSession.endSession();
    }
    disconnectUserSockets(user._id.toString());

    return noStoreJson(
      {
        message:
          "Đã gửi hồ sơ mở shop. Vui lòng đăng nhập lại bằng cổng Người bán để theo dõi duyệt.",
        next: "/vendor/login",
      },
      { status: 200 },
    );
  } catch (error) {
    return noStoreJson(
      { message: apiErrorMessage("Không thể gửi hồ sơ bán hàng", error) },
      { status: 500 },
    );
  }
}
