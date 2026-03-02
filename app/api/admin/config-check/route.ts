import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    groqKey: !!process.env.GROQ_API_KEY,
    placesKey: !!process.env.GOOGLE_PLACES_API_KEY,
    evolutionUrl: !!process.env.EVOLUTION_API_URL,
    evolutionKey: !!process.env.EVOLUTION_API_KEY,
  };

  return NextResponse.json(config);
}
