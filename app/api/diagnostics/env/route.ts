import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem verificar configurações.' }, { status: authStatus });
  }

  const config = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    groqKey: !!process.env.GROQ_API_KEY,
    groqModel: !!process.env.GROQ_MODEL,
    placesKey: !!process.env.GOOGLE_PLACES_API_KEY,
    evolutionUrl: !!process.env.EVOLUTION_API_URL,
    evolutionKey: !!process.env.EVOLUTION_API_KEY,
    siteUrl: !!process.env.NEXT_PUBLIC_SITE_URL,
    appUrl: !!process.env.APP_URL,
  };

  return NextResponse.json(config);
}
