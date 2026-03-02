import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const { id, ...updates } = await request.json();
    
    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID é obrigatório' }, { status: 400 });
    }

    // Map common aliases to correct column names
    const mappedUpdates: any = { ...updates };
    if (mappedUpdates.trial_ends_at) {
      mappedUpdates.trial_end = mappedUpdates.trial_ends_at;
      delete mappedUpdates.trial_ends_at;
    }
    if (mappedUpdates.system_prompt) {
      mappedUpdates.bot_instructions = mappedUpdates.system_prompt;
      delete mappedUpdates.system_prompt;
    }

    const { error } = await supabase
      .from('clients')
      .update(mappedUpdates)
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('API Clients Update Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
