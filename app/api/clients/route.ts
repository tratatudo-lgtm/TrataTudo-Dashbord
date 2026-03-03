import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const query = searchParams.get('q');

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    let dbQuery = supabase
      .from('clients')
      .select('id, company_name, phone_e164, bot_instructions, trial_end, status');

    if (status && status !== 'all') {
      dbQuery = dbQuery.eq('status', status);
    }

    if (query) {
      dbQuery = dbQuery.or(`company_name.ilike.%${query}%,phone_e164.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery.order('id', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data || [] });
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
    const { company_name, phone_e164, bot_instructions } = body;

    if (!company_name || !phone_e164) {
      return NextResponse.json(
        { ok: false, error: 'Nome da empresa e telefone são obrigatórios' },
        { status: 400 }
      );
    }

    const trialStart = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3);

    const { error } = await supabase
      .from('clients')
      .insert([{
        company_name,
        phone_e164,
        bot_instructions: bot_instructions || 'Olá! Como posso ajudar? 🙂',
        status: 'trial',
        trial_start: trialStart.toISOString(),
        trial_end: trialEnd.toISOString()
      }]);

    if (error) {
      if (error.code === '23505' || error.message?.toLowerCase().includes('phone_e164')) {
        return NextResponse.json({ ok: false, error: 'Este número já está registado.' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('API Clients POST Error:', error);
    const message =
      error.code === '23505' || error.message?.toLowerCase().includes('phone_e164')
        ? 'Este número já está registado.'
        : error.message;

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}