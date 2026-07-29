import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  DEVICE_COOKIE,
  hashDeviceId,
  isValidDeviceId,
  listTrustedDevices,
} from "@/lib/security/device";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }

    const rawDeviceId = req.cookies.get(DEVICE_COOKIE)?.value;
    const currentHash = isValidDeviceId(rawDeviceId)
      ? hashDeviceId(rawDeviceId)
      : null;
    const devices = await listTrustedDevices(session.user.id);
    return NextResponse.json(
      {
        devices: devices.map((device) => ({
          id: device._id.toString(),
          label: device.label,
          createdAt: device.createdAt,
          lastSeenAt: device.lastSeenAt,
          expiresAt: device.expiresAt,
          thisDevice: currentHash === device.deviceIdHash,
        })),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("Trusted device listing failed", error);
    return NextResponse.json(
      { message: "Không tải được danh sách thiết bị." },
      { status: 500, headers: NO_STORE },
    );
  }
}
