import { getProvinces, GHNError } from "@/lib/ghn";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const provinces = await getProvinces();
    return NextResponse.json({ provinces }, { status: 200 });
  } catch (error) {
    const msg =
      error instanceof GHNError ? error.message : `GHN province error ${error}`;
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}
