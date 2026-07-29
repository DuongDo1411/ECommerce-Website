import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { clearDeviceCookie } from "@/lib/security/device";
import { revokeAllSessions } from "@/lib/security/session";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }
    await revokeAllSessions(session.user.id);
    return clearDeviceCookie(
      NextResponse.json(
        { message: "Đã đăng xuất khỏi tất cả thiết bị." },
        { status: 200, headers: NO_STORE },
      ),
    );
  } catch (error) {
    console.error("Account-wide logout failed", error);
    return NextResponse.json(
      { message: "Không thể đăng xuất khỏi các thiết bị. Vui lòng thử lại." },
      { status: 500, headers: NO_STORE },
    );
  }
}
