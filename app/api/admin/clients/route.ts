import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { normalizeE164 } from '@/lib/phone';
import { validateAdmin } from '@/lib/auth-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem listar clientes.' }, { status: authStatus });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const query = searchParams.get('q');

    const supabase = createAdminClient();
    let dbQuery = supabase.from('clients').select('*');

    if (status && status !== 'all') {
      dbQuery = dbQuery.eq('status', status);
    }

    if (query) {
      dbQuery = dbQuery.or(`company_name.ilike.%${query}%,phone_e164.ilike.%${query}%`);
    }

    // Try to order by trial_end or id if updated_at doesn't exist
    const { data, error } = await dbQuery.order('id', { ascending: false });

    if (error) {
      console.error('Supabase Clients Error:', error);
      // Fallback: try to select only columns we are reasonably sure about
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('clients')
        .select('id, status')
        .order('id', { ascending: false });
      
      if (fallbackError) throw fallbackError;
      
      return NextResponse.json(fallbackData.map((c: any) => ({
        ...c,
        company_name: c.company_name || c.name || 'Empresa sem nome',
        phone_e164: c.phone_e164 || c.phone || 'N/A',
        trial_end: c.trial_end || c.trial_ends_at || null
      })));
    }

    // Map data to ensure consistent field names for the UI
    const mappedClients = data?.map((c: any) => ({
      ...c,
      company_name: c.company_name || c.name || '',
      phone_e164: c.phone_e164 || c.phone || '',
      instance_name: c.instance_name || c.instance_id || '',
      trial_end: c.trial_end || c.trial_ends_at || c.trial_expires_at || null,
      bot_instructions: c.bot_instructions || c.system_prompt || ''
    })) || [];

    return NextResponse.json(mappedClients);
  } catch (error: any) {
    console.error('API Admin Clients GET Error:', error);
    return NextResponse.json({ ok: false, error: error.message, hint: 'Erro ao consultar a base de dados.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem criar clientes.' }, { status: authStatus });
    }

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
    if (payload.trial_ends_at && !payload.trial_expires_at) payload.trial_expires_at = payload.trial_ends_at;
    if (payload.instance_name && !payload.instance_id) payload.instance_id = payload.instance_name;

    const supabase = createAdminClient();

    // We'll try to insert, and if it fails due to unknown columns, we'll strip them and try again
    const { data, error } = await supabase
      .from('clients')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Supabase Clients POST Error:', error);
      // If it's a column error, try a minimal insert
      if (error.message.includes('column') || error.code === '42703') {
        const minimalPayload = {
          company_name: body.company_name || body.name,
          phone_e164: body.phone_e164 || body.phone,
          status: body.status || 'trial'
        };
        const { data: retryData, error: retryError } = await supabase
          .from('clients')
          .insert([minimalPayload])
          .select()
          .single();
        
        if (retryError) throw retryError;
        return NextResponse.json(retryData);
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Admin Clients POST Error:', error);
    return NextResponse.json({ ok: false, error: error.message, hint: 'Erro ao inserir na base de dados.' }, { status: 500 });
  }
}
