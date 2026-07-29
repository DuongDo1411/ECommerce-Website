import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { BCRYPT_COST, validatePasswordPolicy } from "@/lib/security/password";
import {
  disconnectUserSockets,
  revokeAccountSecurity,
} from "@/lib/security/session";
import User from "@/model/user.model";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized User" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return NextResponse.json(
        { message: "Vui lòng nhập đầy đủ mật khẩu" },
        { status: 400 },
      );
    }

    // password is select:false — load it explicitly for the compare-and-swap.
    const user = await User.findById(session.user.id).select("+password");
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    if (typeof user.password !== "string") {
      return NextResponse.json(
        { message: "Tài khoản liên kết Google, mật khẩu do Google quản lý." },
        { status: 400 },
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json(
        { message: "Mật khẩu hiện tại không đúng" },
        { status: 400 },
      );
    }

    const policy = await validatePasswordPolicy(newPassword);
    if (!policy.ok) {
      return NextResponse.json({ message: policy.reason }, { status: 400 });
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    // Compare-and-swap on the exact old hash: two concurrent requests that read
    // the same hash cannot both win — the loser matches nothing and gets 409.
    const swapped = await User.findOneAndUpdate(
      { _id: user._id, password: user.password },
      { $set: { password: newHash } },
    );
    if (!swapped) {
      return NextResponse.json(
        { message: "Mật khẩu vừa được thay đổi. Vui lòng thử lại." },
        { status: 409 },
      );
    }

    // Đổi mật khẩu thu hồi mọi phiên/thiết bị tin cậy đang hoạt động.
    await revokeAccountSecurity(user._id.toString());
    disconnectUserSockets(user._id.toString());

    return NextResponse.json(
      { message: "Đổi mật khẩu thành công" },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { message: `change password error ${error}` },
      { status: 500 },
    );
  }
}
