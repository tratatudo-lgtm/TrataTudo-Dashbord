import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = safeStr(body.email);
    const password = safeStr(body.password);

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "email e password são obrigatórios" },
        { status: 400 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !anon) {
      return NextResponse.json(
        { ok: false, error: "Supabase env em falta" },
        { status: 500 }
      );
    }

    // criar resposta cedo para poder SETAR cookies nela
    const res = NextResponse.json({ ok: true });

    const cookieStore = cookies();

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session) {
      return NextResponse.json(
        { ok: false, error: error?.message || "login_failed" },
        { status: 401 }
      );
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 }
    );
  }
}