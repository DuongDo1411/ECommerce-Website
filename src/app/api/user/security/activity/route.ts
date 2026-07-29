import { auth } from "@/auth";
import connectDB from "@/lib/connectDB";
import { hashDeviceId, readOrCreateDeviceId } from "@/lib/security/device";
import LoginActivity from "@/model/loginActivity.model";
import { NextRequest, NextResponse } from "next/server";

const PAGE_SIZE = 20;

/**
 * The account's own recent sign-in attempts. Scoped to `session.user.id`, never
 * to an id from the request, so one account can never read another's trail.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const entries = await LoginActivity.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE)
      .lean();

    const currentDeviceHash = hashDeviceId(readOrCreateDeviceId(req));

    return NextResponse.json({
      // Deliberately narrow: the stored device digest stays server-side, and
      // only a boolean about *this* browser crosses the wire.
      activity: entries.map((entry) => ({
        id: entry._id.toString(),
        at: entry.createdAt,
        ip: entry.ip,
        userAgent: entry.userAgent,
        success: entry.success,
        thisDevice: entry.deviceIdHash === currentDeviceHash,
      })),
    });
  } catch {
    return NextResponse.json(
      { message: "Không tải được nhật ký đăng nhập." },
      { status: 500 },
    );
  }
}
