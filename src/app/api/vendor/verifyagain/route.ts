import { NextRequest, NextResponse } from "next/server";

import connectDB from "@/lib/connectDB";
import { requireRole } from "@/lib/rbac";
import { submitVendorProfile } from "@/lib/vendor/submitProfile";
import { readLimitedJsonBody } from "@/lib/security/requestBody";
import { noStoreJson } from "@/lib/security/response";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Nộp hồ sơ cửa hàng. Toàn bộ xác thực và chuyển trạng thái nằm trong
 * `submitVendorProfile`, dùng chung với route còn lại của cùng nghiệp vụ này.
 *
 * KHÔNG áp guard "đã được duyệt" ở đây: đúng những nhà bán chưa được duyệt mới là
 * người cần gọi tới nó.
 */
export async function POST(req: NextRequest) {
  try {
    const authz = await requireRole(["vendor"], { mode: "api" });
    if (authz instanceof NextResponse) return authz;

    await connectDB();

    let body: unknown;
    try {
      body = await readLimitedJsonBody(req, MAX_BODY_BYTES);
    } catch (parseError) {
      const tooLarge = parseError instanceof RangeError;
      return noStoreJson(
        { message: tooLarge ? "Dữ liệu quá lớn." : "Dữ liệu không hợp lệ." },
        { status: tooLarge ? 413 : 400 },
      );
    }

    const result = await submitVendorProfile(authz.user._id, body);
    const { status, ...payload } = result;
    return noStoreJson(payload, { status });
  } catch (error) {
    console.error("[vendor/verifyagain] loi", error);
    return noStoreJson(
      { message: "Không thể gửi hồ sơ lúc này." },
      { status: 500 },
    );
  }
}
