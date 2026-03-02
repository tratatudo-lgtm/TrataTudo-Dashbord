import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { normalizeE164 } from '@/lib/phone';
import { validateAdmin } from '@/lib/auth-admin';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem ver detalhes de clientes.' }, { status: authStatus });
    }

    const id = params.id;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Admin Clients GET ID Error:', error);
    return NextResponse.json({ ok: false, error: error.message, hint: 'Erro ao carregar detalhes do cliente.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem atualizar clientes.' }, { status: authStatus });
    }

    const id = params.id;
    const body = await request.json();

    if (body.phone_e164) {
      const normalized = normalizeE164(body.phone_e164);
      if (!normalized) {
        return NextResponse.json({ ok: false, error: 'Formato de telefone inválido', hint: 'Use o formato E.164 (ex: +351912345678)' }, { status: 400 });
      }
      body.phone_e164 = normalized;
    }

    // Add aliases for common schema variations
    const payload = { ...body };
    if (payload.company_name && !payload.name) payload.name = payload.company_name;
    if (payload.trial_end && !payload.trial_ends_at) payload.trial_ends_at = payload.trial_end;
    if (payload.trial_ends_at && !payload.trial_end) payload.trial_end = payload.trial_ends_at;
    if (payload.bot_instructions && !payload.system_prompt) payload.system_prompt = payload.bot_instructions;
    if (payload.system_prompt && !payload.bot_instructions) payload.bot_instructions = payload.system_prompt;
    if (payload.instance_name && !payload.instance_id) payload.instance_id = payload.instance_name;

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('clients')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase Clients PATCH Error:', error);
      // If it's a column error, try a minimal update
      if (error.message.includes('column') || error.code === '42703') {
        const minimalPayload: any = {};
        if (body.company_name || body.name) minimalPayload.company_name = body.company_name || body.name;
        if (body.phone_e164 || body.phone) minimalPayload.phone_e164 = body.phone_e164 || body.phone;
        if (body.status) minimalPayload.status = body.status;
        if (body.trial_end || body.trial_ends_at) minimalPayload.trial_end = body.trial_end || body.trial_ends_at;
        if (body.bot_instructions || body.system_prompt) minimalPayload.bot_instructions = body.bot_instructions || body.system_prompt;
        
        const { data: retryData, error: retryError } = await supabase
          .from('clients')
          .update(minimalPayload)
          .eq('id', id)
          .select()
          .single();
        
        if (retryError) throw retryError;
        return NextResponse.json(retryData);
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Admin Clients PATCH Error:', error);
    return NextResponse.json({ ok: false, error: error.message, hint: 'Erro ao atualizar dados do cliente.' }, { status: 500 });
  }
}
