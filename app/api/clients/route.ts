import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const DEFAULT_INSTANCE_NAME = 'TrataTudo bot';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const query = searchParams.get('q');

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    let dbQuery = supabase
      .from('clients')
      .select(`
        id,
        company_name,
        phone_e164,
        bot_instructions,
        trial_end,
        status,
        instance_name,
        production_instance_name,
        client_instances (
          instance_name,
          is_hub,
          status,
          created_at
        )
      `);

    if (status && status !== 'all') {
      dbQuery = dbQuery.eq('status', status);
    }

    if (query) {
      dbQuery = dbQuery.or(`company_name.ilike.%${query}%,phone_e164.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery.order('id', { ascending: false });
    if (error) throw error;

    const normalized = (data || []).map((client: any) => {
      const activeInstance =
        client.client_instances?.find((ci: any) => ci.status === 'active') ||
        client.client_instances?.[0] ||
        null;

      return {
        id: client.id,
        company_name: client.company_name,
        phone_e164: client.phone_e164,
        bot_instructions: client.bot_instructions,
        trial_end: client.trial_end,
        status: client.status,
        instance_name:
          activeInstance?.instance_name ||
          client.production_instance_name ||
          client.instance_name ||
          null,
        is_hub: activeInstance?.is_hub ?? null,
        instance_status: activeInstance?.status ?? null,
      };
    });

    return NextResponse.json({ ok: true, data: normalized });
  } catch (error: any) {
    console.error('API Clients GET Error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

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

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3);

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert([
        {
          company_name,
          phone_e164,
          bot_instructions: bot_instructions || 'Olá! Como posso ajudar?',
          status: 'trial',
          trial_end: trialEnd.toISOString(),
          instance_name: DEFAULT_INSTANCE_NAME,
        },
      ])
      .select('id')
      .single();

    if (clientError) {
      if (clientError.code === '23505' || clientError.message?.includes('phone_e164')) {
        return NextResponse.json(
          { ok: false, error: 'Este número já está registado.' },
          { status: 400 }
        );
      }
      throw clientError;
    }

    const { data: existing, error: existingError } = await supabase
      .from('client_instances')
      .select('id')
      .eq('client_id', client.id)
      .eq('instance_name', DEFAULT_INSTANCE_NAME)
      .maybeSingle();

    if (existingError) throw existingError;

    if (!existing) {
      const { error: linkError } = await supabase.from('client_instances').insert([
        {
          client_id: client.id,
          instance_name: DEFAULT_INSTANCE_NAME,
          is_hub: true,
          status: 'active',
        },
      ]);

      if (linkError) throw linkError;
    }

    return NextResponse.json({ ok: true, id: client.id });
  } catch (error: any) {
    console.error('API Clients POST Error:', error);
    const message =
      error.code === '23505' || error.message?.includes('phone_e164')
        ? 'Este número já está registado.'
        : error.message;

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}