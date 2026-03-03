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

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Resolve instâncias ativas do cliente (pode haver mais que 1 historicamente).
 * Vamos usar as "active" em client_instances.
 */
async function getActiveInstanceNames(admin: ReturnType<typeof getSupabaseAdmin>, client_id: number) {
  const { data, error } = await admin
    .from('client_instances')
    .select('instance_name')
    .eq('client_id', client_id)
    .eq('status', 'active');

  if (error) throw error;
  const names = (data || []).map((r: any) => safeStr(r.instance_name)).filter(Boolean);

  // fallback para o hub se por algum motivo estiver vazio
  return names.length ? names : ['TrataTudo bot'];
}

export async function GET(req: Request) {
  try {
    // Auth: API key (server-to-server) OU sessão (dashboard)
    const supabase = createClient();
    const apiKeyOk = isValidApiKey(req);
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // filtros opcionais
    const client_id = Number(searchParams.get('client_id') || '');
    const phone_e164 = safeStr(searchParams.get('phone_e164') || searchParams.get('q') || '');
    const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

    const admin = getSupabaseAdmin();

    let instanceNames: string[] = [];
    if (client_id) {
      instanceNames = await getActiveInstanceNames(admin, client_id);
    }

    // base query: wa_messages (não messages!)
    let db = admin
      .from('wa_messages')
      .select('id, phone_e164, instance, direction, text, raw, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    // se veio client_id, filtra por instâncias ativas desse cliente
    if (client_id) {
      db = db.in('instance', instanceNames);
    }

    // se veio phone, filtra pelo phone_e164
    if (phone_e164) {
      db = db.eq('phone_e164', phone_e164);
    }

    const { data, error } = await db;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: data || [],
      meta: {
        client_id: client_id || null,
        instances: client_id ? instanceNames : null,
        limit,
      }
    });
  } catch (err: any) {
    console.error('API Messages GET Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}