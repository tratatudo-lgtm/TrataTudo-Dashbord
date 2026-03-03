import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "TrataTudo Dashboard",
    ts: new Date().toISOString(),
  });
}