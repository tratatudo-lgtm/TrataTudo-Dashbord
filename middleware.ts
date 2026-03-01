import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // se faltar configuração, não bloqueia o acesso
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        // escrever apenas no response
        response.cookies.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        response.cookies.set({ name, value: '', ...options, maxAge: 0 })
      },
    },
  })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = request.nextUrl.pathname

  const publicRoutes = ['/login', '/auth/callback', '/reset-password']
  const isPublicRoute = publicRoutes.some(route =>
    pathname.startsWith(route)
  )

  // proteger área privada
  if (pathname.startsWith('/app') && !session) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // evitar voltar ao login se já autenticado
  if (pathname === '/login' && session) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/app'
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  if (isPublicRoute) return response

  return response
}

export const config = {
  matcher: ['/app/:path*', '/login', '/auth/callback', '/reset-password'],
}