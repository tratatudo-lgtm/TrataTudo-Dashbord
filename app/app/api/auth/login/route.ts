import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json(
      { ok: false, error: "missing_env" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "").trim();

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "email_and_password_required" },
      { status: 400 }
    );
  }

  // Resposta que vamos devolver (para podermos setar cookies nela)
  const res = NextResponse.json({ ok: true });

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 401 }
    );
  }

  return res;
}