import { auth } from "@/auth";
import { apiErrorMessage } from "@/lib/apiError";
import connectDB from "@/lib/connectDB";
import { noStoreJson } from "@/lib/security/response";
import User from "@/model/user.model";
import { NextRequest } from "next/server";

/** Phone-only profile completion. Role changes never enter this endpoint. */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return noStoreJson({ message: "Unauthorized" }, { status: 401 });
    }

    let body: { phone?: unknown };
    try {
      body = await req.json();
    } catch {
      return noStoreJson({ message: "Dữ liệu không hợp lệ." }, { status: 400 });
    }
    const phone = String(body.phone ?? "").trim();
    if (!/^0\d{9}$/.test(phone)) {
      return noStoreJson(
        {
          message:
            "Số điện thoại không hợp lệ — phải gồm 10 chữ số và bắt đầu bằng 0 (VD: 0901234567).",
        },
        { status: 400 },
      );
    }

    await connectDB();
    const result = await User.updateOne(
      { _id: session.user.id },
      { $set: { phone } },
    );
    if (result.matchedCount !== 1) {
      return noStoreJson({ message: "Unauthorized" }, { status: 401 });
    }

    return noStoreJson(
      { message: "Đã cập nhật số điện thoại.", phone },
      { status: 200 },
    );
  } catch (error) {
    return noStoreJson(
      { message: apiErrorMessage("Edit phone error", error) },
      { status: 500 },
    );
  }
}
