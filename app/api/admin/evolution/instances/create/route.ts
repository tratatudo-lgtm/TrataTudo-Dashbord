// app/api/admin/evolution/instances/create/route.ts
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
    return NextResponse.json({ ok: false, error: adminCheck?.error || 'Não autorizado' }, { status: adminCheck?.status || 401 });
  }

  try {
    const supabase = createClient();
    const body = await req.json();

    const client_id = Number(body.client_id);
    if (!client_id) {
      return NextResponse.json({ ok: false, error: 'client_id é obrigatório' }, { status: 400 });
    }

    const instance_name = safeStr(body.instance_name) || `client-${client_id}`;

    // 1) Criar instância no Evolution
    const evo = await createEvolutionInstance(instance_name);
    if (!evo.ok) {
      return NextResponse.json(
        { ok: false, error: evo.error || 'Falha ao criar instância', evolution: evo },
        { status: 500 }
      );
    }

    // 2) Registar/ativar em client_instances
    const { error: upErr } = await supabase
      .from('client_instances')
      .upsert(
        [{
          client_id,
          instance_name,
          is_hub: false,
          status: 'active',
          created_at: new Date().toISOString(),
        }],
        { onConflict: 'client_id,instance_name' as any }
      );

    // (se o teu Supabase não tiver constraint (client_id,instance_name), o upsert pode falhar.
    // Se falhar, trocamos para insert+ignore. Para já tentamos o melhor.)

    // 3) Atualizar cliente para apontar produção (opcional: liga já)
    // Aqui assumimos que quando crias, queres usar como production.
    const { error: cErr } = await supabase
      .from('clients')
      .update({
        production_instance_name: instance_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client_id);

    if (upErr) {
      // não bloqueia, mas reporta
      return NextResponse.json({
        ok: true,
        warning: 'Instância criada no Evolution, mas falhou update em client_instances',
        warning_detail: upErr.message,
        data: { client_id, instance_name, evolution: evo.data },
      });
    }

    if (cErr) {
      return NextResponse.json({
        ok: true,
        warning: 'Instância criada e registada, mas falhou update em clients.production_instance_name',
        warning_detail: cErr.message,
        data: { client_id, instance_name, evolution: evo.data },
      });
    }

    return NextResponse.json({
      ok: true,
      data: { client_id, instance_name, evolution: evo.data },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}