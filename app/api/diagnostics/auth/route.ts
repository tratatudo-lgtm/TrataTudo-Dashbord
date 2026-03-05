import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

function safeLen(v?: string | null) {
  return (v || "").length;
}

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  // Lê cookies do request (NÃO uses cookies() aqui)
  const cookieHeader = req.headers.get("cookie") || "";
  const cookieNames = cookieHeader
    .split(";")
    .map((s) => s.trim().split("=")[0])
    .filter(Boolean)
    .slice(0, 50);

  const res = NextResponse.json({
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
      user: null as any,
      error: null as any,
    },
  });

  try {
    if (!supabaseUrl || !supabaseAnon) {
      return res;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll() {
          // parse simples do header cookie
          const out: { name: string; value: string }[] = [];
          const parts = cookieHeader.split(";").map((p) => p.trim()).filter(Boolean);
          for (const p of parts) {
            const idx = p.indexOf("=");
            if (idx <= 0) continue;
            out.push({ name: p.slice(0, idx), value: decodeURIComponent(p.slice(idx + 1)) });
          }
          return out;
        },
        setAll() {
          // não precisamos setar cookies neste diagnóstico
        },
      },
    });

    const { data, error } = await supabase.auth.getUser();

    // @ts-ignore
    res.body = undefined;

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