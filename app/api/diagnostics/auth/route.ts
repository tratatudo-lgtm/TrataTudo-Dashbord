import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function safeLen(v?: string | null) {
  return (v || "").length;
}

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    const cookieHeader = req.headers.get("cookie") || "";
    const cookieNames = cookieHeader
      .split(";")
      .map((s) => s.trim().split("=")[0])
      .filter(Boolean)
      .slice(0, 60);

    // Se env vars faltam, devolve logo diagnóstico
    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({
        ok: true,
        env: {
          NEXT_PUBLIC_SUPABASE_URL_len: safeLen(supabaseUrl),
          NEXT_PUBLIC_SUPABASE_ANON_KEY_len: safeLen(supabaseAnon),
          NEXT_PUBLIC_SUPABASE_URL_preview: supabaseUrl ? supabaseUrl.slice(0, 40) + "..." : "",
        },
        req: {
          host: req.headers.get("host"),
          x_forwarded_proto: req.headers.get("x-forwarded-proto"),
          cookie_header_len: cookieHeader.length,
          cookie_names: cookieNames,
        },
        auth: {
          user: null,
          error: "missing_env_vars",
        },
      });
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // Não precisamos setar cookies neste endpoint
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();

    return NextResponse.json({
      ok: true,
      env: {
        NEXT_PUBLIC_SUPABASE_URL_len: safeLen(supabaseUrl),
        NEXT_PUBLIC_SUPABASE_ANON_KEY_len: safeLen(supabaseAnon),
        NEXT_PUBLIC_SUPABASE_URL_preview: supabaseUrl ? supabaseUrl.slice(0, 40) + "..." : "",
      },
      req: {
        host: req.headers.get("host"),
        x_forwarded_proto: req.headers.get("x-forwarded-proto"),
        cookie_header_len: cookieHeader.length,
        cookie_names: cookieNames,
      },
      auth: {
        user: data?.user ? { id: data.user.id, email: data.user.email } : null,
        error: error ? String(error.message || error) : null,
      },
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: "diagnostics_failed",
      detail: String(e?.message || e),
    });
  }
}