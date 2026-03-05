import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAdmin } from '@/lib/auth-admin';
import {
  createEvolutionInstance,
  setEvolutionInstanceWebhook,
  getEvolutionInstanceQR,
  getEvolutionInstanceStatus,
} from '@/lib/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v:any){ return (v==null?'':String(v).trim()); }

export async function POST(req: Request) {
  try {
    const admin = await validateAdmin();
    if (!admin?.isAdmin) {
      const status = (admin as any)?.status || 401;
      const error = (admin as any)?.error || 'Não autorizado';
      return NextResponse.json({ ok: false, error }, { status });
    }

    const body = await req.json();
    const client_id = Number(body.client_id);
    if (!client_id) return NextResponse.json({ ok:false, error:'client_id obrigatório' }, { status: 400 });

    const supabase = createClient();

    // buscar cliente
    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, company_name, instance_name, status, trial_end')
      .eq('id', client_id)
      .single();

    if (cErr) return NextResponse.json({ ok:false, error:cErr.message }, { status: 500 });

    // definir nome de instância
    const instanceName = safeStr(client.instance_name) || `client-${client_id}`;

    // 1) criar instância
    const created = await createEvolutionInstance(instanceName);
    if (!created.ok) {
      return NextResponse.json({ ok:false, step:'create_instance', error: created.error, raw: created.raw }, { status: 500 });
    }

    // 2) configurar webhook para o relay
    const wh = await setEvolutionInstanceWebhook(instanceName);
    if (!wh.ok) {
      return NextResponse.json({ ok:false, step:'set_webhook', error: wh.error, raw: wh.raw }, { status: 500 });
    }

    // 3) status
    const statusRes = await getEvolutionInstanceStatus(instanceName);

    // 4) pedir QR (para ligação)
    const qr = await getEvolutionInstanceQR(instanceName);

    // 5) guardar instance_name no cliente (se não tinha)
    if (!safeStr(client.instance_name)) {
      await supabase.from('clients')
        .update({ instance_name: instanceName, updated_at: new Date().toISOString() })
        .eq('id', client_id);
    }

    return NextResponse.json({
      ok: true,
      data: {
        client_id,
        instance_name: instanceName,
        evolution_created: created.ok,
        webhook_set: wh.ok,
        status: statusRes.data ?? null,
        qr: qr.data ?? null,
      }
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}