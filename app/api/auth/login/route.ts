// app/api/auth/login/route.ts
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
    const email = safeStr(body?.email);
    const password = safeStr(body?.password);

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email e password são obrigatórios" },
        { status: 400 }
      );
    }

    const cookieStore = cookies();

    // ⚠️ IMPORTANTE: usar @supabase/ssr para suportar "cookie chunking"
    // (quando o token é grande, ele cria sb-...-auth-token.0, .1, etc)
    let response = NextResponse.json({ ok: true });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            // aplicar cookies no response (chunking incluído)
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set({
                name,
                value,
                ...options,
                // reforçar opções seguras
                path: options?.path ?? "/",
                sameSite: options?.sameSite ?? "lax",
                secure:
                  process.env.NODE_ENV === "production"
                    ? true
                    : (options?.secure ?? false),
              });
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      response = NextResponse.json(
        { ok: false, error: error.message },
        { status: 401 }
      );
      return response;
    }

    // ✅ Sessão criada e cookies gravados (chunked)
    return response;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "server_error", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}