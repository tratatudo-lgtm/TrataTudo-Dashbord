import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.next();
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Proteção de rotas /app
  if (request.nextUrl.pathname.startsWith('/app')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Verificar se é admin (opcional: podes ter uma tabela 'admins' ou usar metadados)
    // Para este MVP, vamos assumir que qualquer user autenticado no Supabase pode entrar
    // mas podes adicionar uma query aqui para validar na tabela 'admins'.
  }

  // Redirecionar se já estiver logado
  if (request.nextUrl.pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/app', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/app/:path*', '/login'],
};
