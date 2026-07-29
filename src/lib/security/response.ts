import { NextResponse } from "next/server";

export function noStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

