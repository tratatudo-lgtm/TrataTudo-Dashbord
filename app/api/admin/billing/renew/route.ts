import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase env');
  return createSupabaseAdmin(url, key, { auth: { persistSession: false } });
}

async function isAdminSession() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return { ok: false as const, user_id: null as string | null };

  // admins(user_id uuid not null) — pelo que já tens no Supabase
  const { data: row, error } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  return { ok: !!row, user_id: session.user.id };
}

/**
 * Regra B:
 * - Se subscription_expires_at > now(): soma +days em cima do que já existe
 * - Senão: now() +days
 */
function computeNextExpiry(current: string | null, days: number) {
  const now = new Date();
  const cur = current ? new Date(current) : null;
  const base = (cur && cur.getTime() > now.getTime()) ? cur : now;
  const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
}

export async function POST(req: Request) {
  try {
    // Auth: API key OU sessão admin
    const apiKeyOk = isValidApiKey(req);
    let adminOk = false;

    if (!apiKeyOk) {
      const s = await isAdminSession();
      adminOk = s.ok;
    }

    if (!apiKeyOk && !adminOk) {
      return NextResponse.json(
        { ok: false, error: 'Não autorizado', reason: 'not-admin' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const client_id = Number(body.client_id);
    const days = Math.max(1, Math.min(365, Number(body.days ?? 30))); // default 30, máximo 365
    const setActive = body.set_active !== false; // default true

    if (!client_id) {
      return NextResponse.json(
        { ok: false, error: 'client_id é obrigatório' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1) Buscar estado atual do cliente
    const { data: client, error: cErr } = await supabaseAdmin
      .from('clients')
      .select('id, status, subscription_expires_at, trial_end')
      .eq('id', client_id)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!client) {
      return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 });
    }

    // 2) Calcular nova expiração (Regra B)
    const nextExpiry = computeNextExpiry(client.subscription_expires_at, days);

    // 3) Atualizar
    const updatePayload: any = {
      subscription_expires_at: nextExpiry,
      updated_at: new Date().toISOString(),
    };

    if (setActive) {
      updatePayload.status = 'active';
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('clients')
      .update(updatePayload)
      .eq('id', client_id)
      .select('id, status, subscription_expires_at')
      .single();

    if (uErr) throw uErr;

    return NextResponse.json({
      ok: true,
      data: {
        client_id: updated.id,
        status: updated.status,
        subscription_expires_at: updated.subscription_expires_at,
        days_added: days,
        mode: 'B',
      },
    });
  } catch (err: any) {
    console.error('Billing Renew Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}