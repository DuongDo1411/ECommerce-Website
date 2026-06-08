import { getWards, GHNError } from "@/lib/ghn";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const districtId = Number(
      req.nextUrl.searchParams.get("districtId"),
    );
    if (!districtId) {
      return NextResponse.json(
        { message: "districtId is required" },
        { status: 400 },
      );
    }
    const wards = await getWards(districtId);
    return NextResponse.json({ wards }, { status: 200 });
  } catch (error) {
    const msg =
      error instanceof GHNError ? error.message : `GHN ward error ${error}`;
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
