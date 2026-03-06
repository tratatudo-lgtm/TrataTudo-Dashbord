// app/api/admin/web-allowlist/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeHost(input: string) {
  let s = safeStr(input).toLowerCase();

  // remove protocolo
  s = s.replace(/^https?:\/\//, '');

  // corta path/query
  s = s.split('/')[0].split('?')[0].split('#')[0];

  // remove portas
  s = s.replace(/:\d+$/, '');

  // remove www.
  s = s.replace(/^www\./, '');

  // valida básico
  if (!s) return '';
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return '';

  return s;
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
    const enabled = Boolean(body.enabled);

    let hosts: string[] = Array.isArray(body.hosts) ? body.hosts : [];
    // permitir também CSV vindo da UI
    if (!hosts.length && typeof body.hosts_csv === 'string') {
      hosts = body.hosts_csv.split(',').map((x: string) => x.trim());
    }

    if (!client_id) {
      return NextResponse.json({ ok: false, error: 'client_id é obrigatório' }, { status: 400 });
    }

    const normalized = Array.from(
      new Set(hosts.map(normalizeHost).filter(Boolean))
    );

    const web_allow_hosts = enabled && normalized.length ? normalized.join(', ') : null;

    const web_policy = {
      mode: 'allowlist',
      enabled: Boolean(enabled),
      hosts: enabled ? normalized : [],
      max_results: 5,
    };

    const { error } = await supabase
      .from('clients')
      .update({
        web_allow_hosts,
        web_policy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client_id);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: { client_id, enabled: web_policy.enabled, hosts: normalized, web_allow_hosts },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Erro interno' }, { status: 500 });
  }
}