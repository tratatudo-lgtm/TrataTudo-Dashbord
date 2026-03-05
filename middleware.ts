// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function isPublicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/auth') || // login/logout/callback
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/diagnostics') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots') ||
    pathname.startsWith('/sitemap')
  );
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Deixa passar tudo o que é público/estático
  if (isPublicPath(pathname)) return NextResponse.next();

  // Só protegemos mesmo o /app (dashboard)
  const isProtected = pathname === '/app' || pathname.startsWith('/app/');
  if (!isProtected) return NextResponse.next();

  // Response “mutável” para conseguirmos setar cookies (refresh token)
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          res.cookies.set({ name, value: '', ...options, maxAge: 0 });
        },
      },
    }
  );

  // Isto força o Supabase a validar/atualizar sessão se necessário
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname + (search || ''));
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/app/:path*'],
};