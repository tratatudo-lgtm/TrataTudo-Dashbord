import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function deriveStatus(is_active: boolean | null, trial_expires_at: string | null) {
  if (trial_expires_at) {
    const now = new Date();
    const trialEnd = new Date(trial_expires_at);
    if (trialEnd > now) return 'trial';
  }
  return is_active ? 'active' : 'inactive';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const query = searchParams.get('q');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    let dbQuery = supabase
      .from('clients')
      .select('id, name, phone, active_number, business_type, is_active, trial_expires_at, bot_instructions');

    if (query) {
      dbQuery = dbQuery.or(
        `name.ilike.%${query}%,phone.ilike.%${query}%,active_number.ilike.%${query}%`
      );
    }

    const { data, error } = await dbQuery.order('created_at', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((client) => ({
      id: client.id,
      company_name: client.name,
      phone_e164: client.phone || client.active_number || null,
      business_type: client.business_type,
      bot_instructions: client.bot_instructions || '',
      trial_end: client.trial_expires_at,
      status: deriveStatus(client.is_active, client.trial_expires_at)
    }));

    const filtered = statusFilter && statusFilter !== 'all'
      ? mapped.filter(c => c.status === statusFilter)
      : mapped;

    return NextResponse.json({ ok: true, data: filtered });

  } catch (error: any) {
    console.error('API Clients GET Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { company_name, phone_e164, business_type, bot_instructions } = body;

    if (!company_name) {
      return NextResponse.json({ ok: false, error: 'Nome da empresa é obrigatório' }, { status: 400 });
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3);

    const { data, error } = await supabase
      .from('clients')
      .insert([
        {
          name: company_name,
          phone: phone_e164 || null,
          active_number: phone_e164 || null,
          business_type: business_type || 'Outro',
          trial_expires_at: trialEnd.toISOString(),
          is_active: true,
          bot_instructions: bot_instructions || 'Olá! Como posso ajudar?'
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('API Clients POST Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}