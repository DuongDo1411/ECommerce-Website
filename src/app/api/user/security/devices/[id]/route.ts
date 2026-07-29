import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { auth } from "@/auth";
import {
  DEVICE_COOKIE,
  clearDeviceCookie,
  hashDeviceId,
  isValidDeviceId,
  revokeTrustedDevice,
} from "@/lib/security/device";
import TrustedDevice from "@/model/trustedDevice.model";

const NO_STORE = { "Cache-Control": "no-store" };

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }

    const { id } = await context.params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json(
        { message: "Không tìm thấy thiết bị." },
        { status: 404, headers: NO_STORE },
      );
    }
    const rawDeviceId = req.cookies.get(DEVICE_COOKIE)?.value;
    const currentHash = isValidDeviceId(rawDeviceId)
      ? hashDeviceId(rawDeviceId)
      : null;
    const selected = await TrustedDevice.findOne({
      _id: id,
      userId: session.user.id,
    })
      .select("deviceIdHash")
      .lean();
    const revoked = await revokeTrustedDevice(session.user.id, id);
    if (!revoked) {
      return NextResponse.json(
        { message: "Không tìm thấy thiết bị." },
        { status: 404, headers: NO_STORE },
      );
    }

    const response = NextResponse.json(
      { message: "Đã thu hồi thiết bị đáng tin cậy." },
      { headers: NO_STORE },
    );
    return selected?.deviceIdHash === currentHash
      ? clearDeviceCookie(response)
      : response;
  } catch (error) {
    console.error("Trusted device revocation failed", error);
    return NextResponse.json(
      { message: "Không thể thu hồi thiết bị." },
      { status: 500, headers: NO_STORE },
    );
  }
}
