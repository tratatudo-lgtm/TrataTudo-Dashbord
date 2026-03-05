import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const config = {
  matcher: ["/app/:path*"],
};

export async function middleware(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  // Se env estiverem mal, deixa passar (evita loops estranhos)
  if (!supabaseUrl || !supabaseAnon) return NextResponse.next();

  let res = NextResponse.next();

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

  const { data } = await supabase.auth.getUser();

  if (!data?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  return res;
}