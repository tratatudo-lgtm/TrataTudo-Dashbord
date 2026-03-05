import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  // Deixa passar ficheiros estáticos e rotas públicas
  const { pathname } = req.nextUrl;

  const PUBLIC_PATHS = [
    "/login",
    "/reset-password",
    "/api/health",
    "/api/diagnostics/env",
    "/_next",
    "/favicon.ico",
  ];

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith("/api/"); // <- não bloqueia API (importantíssimo)

  // Cria response “mutável” para cookies
  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Atualiza sessão (refresh automático + escreve cookies no response)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Se é /app* e não há user -> manda para login
  if (pathname.startsWith("/app") && !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Se é público, segue
  if (isPublic) return res;

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};