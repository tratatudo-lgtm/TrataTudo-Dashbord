import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function isPublicPath(pathname: string) {
  // Ajusta aqui se o teu login tiver outro caminho
  const PUBLIC = [
    '/', // vamos decidir no handler
    '/auth',
    '/auth/login',
    '/reset-password',
    '/api/health',
    '/api/diagnostics/env', // se quiseres deixar público
  ];

  // Qualquer coisa dentro de /auth fica pública
  if (pathname.startsWith('/auth')) return true;
  return PUBLIC.includes(pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // deixa passar static, next internals, favicon, etc.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots.txt') ||
    pathname.startsWith('/sitemap.xml')
  ) {
    return NextResponse.next();
  }

  // Criar resposta para podermos gerir cookies
  let res = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Se faltar env, não bloqueia (mas ideal é ter)
  if (!supabaseUrl || !supabaseAnon) return res;

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
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
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // ✅ Regra 1: se tentarem aceder /app sem sessão → login
  if (pathname.startsWith('/app')) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/auth/login'; // <-- troca se o teu login for outro
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return res;
  }

  // ✅ Regra 2 (opcional): proteger APIs de admin por sessão também
  // Se tu usas X-TrataTudo-Key, deixa como está (não mexo).
  // Mas se queres mesmo bloquear admin sem sessão, ativa isto:
  if (pathname.startsWith('/api/admin')) {
    if (!session) {
      return NextResponse.json(
        { ok: false, error: 'Não autenticado', reason: 'no-session' },
        { status: 401 }
      );
    }
    return res;
  }

  // ✅ Regra 3: no "/" decide para onde vai
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = session ? '/app' : '/auth/login'; // <-- troca se login diferente
    return NextResponse.redirect(url);
  }

  // resto do site
  return res;
}

export const config = {
  matcher: [
    /*
      Apanha tudo menos _next/static e assets comuns.
      (Já filtramos acima, mas isto dá performance)
    */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};