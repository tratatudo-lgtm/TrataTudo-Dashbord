import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export async function POST(request: Request) {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError || 'Não autorizado' }, { status: authStatus || 401 });
    }

    const { id, bot_instructions, ...otherUpdates } = await request.json();
    
    if (!id) {
      return NextResponse.json({ ok: false, error: 'ID é obrigatório' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const updates: any = {
      ...otherUpdates,
      bot_instructions: bot_instructions,
      updated_at: new Date().toISOString()
    };

    // Clean up any old names if they were passed
    delete updates.system_prompt;
    delete updates.prompt;
    delete updates.instructions;

    const { error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id);

    if (error) {
      console.error('Supabase Update Error:', error);
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('API Clients Update Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
