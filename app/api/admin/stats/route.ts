import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isValidApiKey(req: Request) {
  const key =
    req.headers.get('x-tratatudo-key') ||
    req.headers.get('X-TrataTudo-Key') ||
    '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

async function isAdminSession(supabase: any) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) return { ok: false, reason: 'no-session' };

  // Ajusta aqui se a tua tabela admins tiver outra coluna (ex: user_id / email)
  // Vamos tentar pelas 2 formas de forma defensiva.
  const userId = session.user.id;
  const email = session.user.email;

  // 1) tenta por user_id
  let res = await supabase
    .from('admins')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (res?.data?.id) return { ok: true };

  // 2) tenta por email
  if (email) {
    res = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (res?.data?.id) return { ok: true };
  }

  return { ok: false, reason: 'not-admin' };
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();

    // ✅ Autenticação: OU sessão admin, OU API key (para server/diagnóstico)
    const apiKeyOk = isValidApiKey(req);
    const adminOk = await isAdminSession(supabase);

    if (!apiKeyOk && !adminOk.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não autenticado',
          hint: 'Apenas administradores podem ver estatísticas.',
          reason: adminOk.reason,
        },
        { status: 401 }
      );
    }

    // ---------- STATS (defensivo) ----------
    // clientes
    const totalClientsRes = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });

    const total_clients = totalClientsRes.count ?? 0;

    const activeRes = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const trialRes = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial');

    const expiredRes = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'expired');

    const active = activeRes.count ?? 0;
    const trial = trialRes.count ?? 0;
    const expired = expiredRes.count ?? 0;

    // mensagens hoje (tenta wa_messages; se falhar devolve 0)
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    let messages_today = 0;
    try {
      const msgRes = await supabase
        .from('wa_messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', start.toISOString());
      messages_today = msgRes.count ?? 0;
    } catch {
      messages_today = 0;
    }

    // tickets “new” (opcional)
    let open_tickets = 0;
    try {
      const tRes = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['new', 'open', 'in_progress']);
      open_tickets = tRes.count ?? 0;
    } catch {
      open_tickets = 0;
    }

    return NextResponse.json({
      ok: true,
      data: {
        totalClients: total_clients,
        activeClients: active,
        trialClients: trial,
        expiredClients: expired,
        messagesToday: messages_today,
        openTickets: open_tickets,
      },
    });
  } catch (err: any) {
    console.error('API Admin Stats Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}