import { createClient } from '@/lib/supabase/server';
import { generateSystemPrompt } from '@/lib/groq';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const businessData = await request.json();
    const prompt = await generateSystemPrompt(businessData);
    return NextResponse.json({ prompt });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
