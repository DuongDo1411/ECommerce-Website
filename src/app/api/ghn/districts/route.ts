import { getDistricts, GHNError } from "@/lib/ghn";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const provinceId = Number(
      req.nextUrl.searchParams.get("provinceId"),
    );
    if (!provinceId) {
      return NextResponse.json(
        { message: "provinceId is required" },
        { status: 400 },
      );
    }
    const districts = await getDistricts(provinceId);
    return NextResponse.json({ districts }, { status: 200 });
  } catch (error) {
    const msg =
      error instanceof GHNError ? error.message : `GHN district error ${error}`;
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
