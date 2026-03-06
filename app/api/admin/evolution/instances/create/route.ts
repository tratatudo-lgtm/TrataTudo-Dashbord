import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAdmin } from '@/lib/auth-admin';
import { createEvolutionInstance } from '@/lib/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function POST(req: Request) {
  const adminCheck = await validateAdmin();

  if (!adminCheck?.isAdmin) {
    return NextResponse.json(
      { ok: false, error: adminCheck?.error || 'Não autorizado' },
      { status: adminCheck?.status || 401 }
    );
  }

  try {
    const supabase = createClient();
    const body = await req.json();

    const client_id = Number(body.client_id);
    if (!client_id) {
      return NextResponse.json(
        { ok: false, error: 'client_id é obrigatório' },
        { status: 400 }
      );
    }

    const instance_name = safeStr(body.instance_name) || `client-${client_id}`;

    // 1) Criar instância dedicada no Evolution
    const evo = await createEvolutionInstance(instance_name);
    if (!evo.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: evo.error || 'Falha ao criar instância',
          evolution: evo,
        },
        { status: 500 }
      );
    }

    // 2) Registar/ativar instância dedicada em client_instances
    const { error: upErr } = await supabase
      .from('client_instances')
      .upsert(
        [
          {
            client_id,
            instance_name,
            is_hub: false,
            status: 'active',
            created_at: new Date().toISOString(),
          },
        ],
        {
          onConflict: 'client_id, instance_name',
        }
      );

    if (upErr) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Falhou o registo da instância dedicada em client_instances',
          detail: upErr.message,
        },
        { status: 500 }
      );
    }

    // 3) Desativar a ligação anterior ao hub de testes
    const { error: hubDeactivateErr } = await supabase
      .from('client_instances')
      .update({ status: 'inactive' })
      .eq('client_id', client_id)
      .eq('instance_name', 'TrataTudo bot')
      .eq('is_hub', true);

    if (hubDeactivateErr) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Instância dedicada criada, mas falhou a desativação do hub trial',
          detail: hubDeactivateErr.message,
        },
        { status: 500 }
      );
    }

    // 4) Atualizar cliente para produção
    const { error: cErr } = await supabase
      .from('clients')
      .update({
        status: 'active',
        production_instance_name: instance_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client_id);

    if (cErr) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Instância criada e registada, mas falhou update do cliente',
          detail: cErr.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        client_id,
        instance_name,
        evolution: evo.data,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}