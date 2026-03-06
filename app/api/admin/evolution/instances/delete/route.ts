// app/api/admin/evolution/instances/delete/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAdmin } from '@/lib/auth-admin';
import { deleteEvolutionInstance } from '@/lib/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function DELETE(req: Request) {
  const adminCheck = await validateAdmin();
  if (!adminCheck?.isAdmin) {
    return NextResponse.json({ ok: false, error: adminCheck?.error || 'Não autorizado' }, { status: adminCheck?.status || 401 });
  }

  try {
    const supabase = createClient();
    const body = await req.json().catch(() => ({}));

    const client_id = Number(body.client_id || 0);
    const instance_name = safeStr(body.instance_name);

    if (!instance_name) {
      return NextResponse.json({ ok: false, error: 'instance_name é obrigatório' }, { status: 400 });
    }

    // 1) Apagar no Evolution (DELETE real)
    const evo = await deleteEvolutionInstance(instance_name);
    if (!evo.ok) {
      return NextResponse.json(
        { ok: false, error: evo.error || 'Falha ao eliminar instância', evolution: evo },
        { status: 500 }
      );
    }

    // 2) Marcar como inactive na DB (se tiver client_id, filtra)
    const q = supabase
      .from('client_instances')
      .update({ status: 'inactive' })
      .eq('instance_name', instance_name);

    if (client_id) q.eq('client_id', client_id);

    const { error: iErr } = await q;
    if (iErr) {
      return NextResponse.json({
        ok: true,
        warning: 'Instância eliminada no Evolution, mas falhou update em client_instances',
        warning_detail: iErr.message,
        data: { client_id: client_id || null, instance_name, evolution: evo.data },
      });
    }

    // 3) Se este instance_name era production_instance_name, limpa (opcional)
    if (client_id) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('production_instance_name')
        .eq('id', client_id)
        .single();

      if (clientRow?.production_instance_name === instance_name) {
        await supabase
          .from('clients')
          .update({ production_instance_name: null, updated_at: new Date().toISOString() })
          .eq('id', client_id);
      }
    }

    return NextResponse.json({
      ok: true,
      data: { client_id: client_id || null, instance_name, evolution: evo.data },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}