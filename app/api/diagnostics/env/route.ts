import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = (() => {
    try {
      const u = new URL(url);
      return u.hostname.split(".")[0] || null;
    } catch {
      return null;
    }
  })();

  return NextResponse.json({
    ok: true,
    node_env: process.env.NODE_ENV,
    supabase_url: url,
    supabase_project_ref: ref,
  });
}