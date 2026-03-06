import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HUB_INSTANCE_NAME = 'TrataTudo bot';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(request.url);

    const status = safeStr(searchParams.get('status'));
    const q = safeStr(searchParams.get('q'));

    let query = supabase
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
        created_at,
        updated_at,
        client_instances (
          id,
          client_id,
          instance_name,
          is_hub,
          status,
          created_at
        )
      `)
      .order('id', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (q) {
      query = query.or(`company_name.ilike.%${q}%,phone_e164.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const normalized = (data || []).map((client: any) => {
      const clientInstances = Array.isArray(client.client_instances)
        ? client.client_instances
        : [];

      const activeDedicated =
        clientInstances.find(
          (ci: any) => ci?.is_hub === false && ci?.status === 'active'
        ) || null;

      const activeHub =
        clientInstances.find(
          (ci: any) =>
            ci?.instance_name === HUB_INSTANCE_NAME &&
            ci?.is_hub === true &&
            ci?.status === 'active'
        ) || null;

      const currentInstance = activeDedicated || activeHub || clientInstances[0] || null;

      return {
        id: client.id,
        company_name: client.company_name,
        phone_e164: client.phone_e164,
        bot_instructions: client.bot_instructions,
        trial_end: client.trial_end,
        status: client.status,
        created_at: client.created_at,
        updated_at: client.updated_at,
        instance_name:
          currentInstance?.instance_name ||
          client.production_instance_name ||
          client.instance_name ||
          null,
        is_hub: currentInstance?.is_hub ?? null,
        instance_status: currentInstance?.status ?? null,
        production_instance_name: client.production_instance_name || null,
      };
    });

    return NextResponse.json({
      ok: true,
      data: normalized,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const body = await request.json();

    const company_name = safeStr(body?.company_name);
    const phone_e164 = safeStr(body?.phone_e164);
    const bot_instructions =
      safeStr(body?.bot_instructions) || 'Olá! Como posso ajudar?';

    if (!company_name || !phone_e164) {
      return NextResponse.json(
        {
          ok: false,
          error: 'company_name e phone_e164 são obrigatórios',
        },
        { status: 400 }
      );
    }

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 3);

    // 1) Criar cliente em trial
    const { data: createdClient, error: clientError } = await supabase
      .from('clients')
      .insert([
        {
          company_name,
          phone_e164,
          bot_instructions,
          status: 'trial',
          trial_end: trialEnd.toISOString(),
          instance_name: HUB_INSTANCE_NAME,
        },
      ])
      .select('id, company_name, phone_e164, status, trial_end, instance_name')
      .single();

    if (clientError) {
      const duplicatePhone =
        clientError.code === '23505' ||
        safeStr(clientError.message).toLowerCase().includes('phone_e164');

      return NextResponse.json(
        {
          ok: false,
          error: duplicatePhone
            ? 'Este número já está registado.'
            : clientError.message,
          raw: {
            code: clientError.code ?? null,
            message: clientError.message ?? null,
            details: (clientError as any).details ?? null,
            hint: (clientError as any).hint ?? null,
          },
        },
        { status: duplicatePhone ? 400 : 500 }
      );
    }

    // 2) Garantir ligação ativa ao hub trial "TrataTudo bot"
    const { data: existingLink, error: existingLinkError } = await supabase
      .from('client_instances')
      .select('id, client_id, instance_name, is_hub, status')
      .eq('client_id', createdClient.id)
      .eq('instance_name', HUB_INSTANCE_NAME)
      .maybeSingle();

    if (existingLinkError) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Cliente criado, mas falhou a verificação da ligação ao hub',
          raw: {
            code: existingLinkError.code ?? null,
            message: existingLinkError.message ?? null,
            details: (existingLinkError as any).details ?? null,
            hint: (existingLinkError as any).hint ?? null,
          },
        },
        { status: 500 }
      );
    }

    if (existingLink?.id) {
      const { error: reactivateError } = await supabase
        .from('client_instances')
        .update({
          is_hub: true,
          status: 'active',
        })
        .eq('id', existingLink.id);

      if (reactivateError) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Cliente criado, mas falhou a reativação do hub trial',
            raw: {
              code: reactivateError.code ?? null,
              message: reactivateError.message ?? null,
              details: (reactivateError as any).details ?? null,
              hint: (reactivateError as any).hint ?? null,
            },
          },
          { status: 500 }
        );
      }
    } else {
      const { error: linkError } = await supabase
        .from('client_instances')
        .insert([
          {
            client_id: createdClient.id,
            instance_name: HUB_INSTANCE_NAME,
            is_hub: true,
            status: 'active',
          },
        ]);

      if (linkError) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Cliente criado, mas falhou a ligação ao hub trial',
            raw: {
              code: linkError.code ?? null,
              message: linkError.message ?? null,
              details: (linkError as any).details ?? null,
              hint: (linkError as any).hint ?? null,
            },
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: createdClient.id,
        company_name: createdClient.company_name,
        phone_e164: createdClient.phone_e164,
        status: createdClient.status,
        trial_end: createdClient.trial_end,
        instance_name: HUB_INSTANCE_NAME,
        is_hub: true,
        instance_status: 'active',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Erro interno',
      },
      { status: 500 }
    );
  }
}