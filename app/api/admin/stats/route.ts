import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function addHoursISO(hours: number) {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();

    // 1) Permitir modo "API key" (server-to-server / testes)
    const apiKeyOk = isValidApiKey(req);

    // 2) Ou permitir modo "sessão" (admin logado)
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;

    if (!apiKeyOk && !session?.user?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não autenticado',
          hint: 'Apenas administradores podem ver estatísticas.',
          reason: 'no-session',
        },
        { status: 401 }
      );
    }

    // 3) Se tiver sessão (sem API key), confirmar admin por user_id
    if (!apiKeyOk && session?.user?.id) {
      const { data: adminRow, error: adminErr } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (adminErr) throw adminErr;

      if (!adminRow) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Não autenticado',
            hint: 'Apenas administradores podem ver estatísticas.',
            reason: 'not-admin',
          },
          { status: 401 }
        );
      }
    }

    // --- STATS ---
    const nowISO = new Date().toISOString();
    const todayISO = startOfTodayISO();
    const soonISO = addHoursISO(24);

    const { count: totalCount, error: e1 } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true });
    if (e1) throw e1;

    const { count: trialCount, error: e2 } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'trial');
    if (e2) throw e2;

    const { count: activeCount, error: e3 } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (e3) throw e3;

    // Expirados: status='expired' + trials com trial_end < agora
    const { count: expiredStatusCount, error: e4 } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'expired');
    if (e4) throw e4;

    const { count: expiredTrialsCount, error: e5 } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'trial')
      .lt('trial_end', nowISO);
    if (e5) throw e5;

    const expiredCount = (expiredStatusCount || 0) + (expiredTrialsCount || 0);

    // Mensagens hoje (wa_messages)
    const { count: messagesToday, error: e6 } = await supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayISO);
    if (e6) throw e6;

    // Expira em 24h
    const { data: expiringSoon, error: e7 } = await supabase
      .from('clients')
      .select('id, company_name, status, trial_end')
      .eq('status', 'trial')
      .gte('trial_end', nowISO)
      .lte('trial_end', soonISO)
      .order('trial_end', { ascending: true })
      .limit(20);
    if (e7) throw e7;

    return NextResponse.json({
      ok: true,
      data: {
        totalCount: totalCount || 0,
        activeCount: activeCount || 0,
        trialCount: trialCount || 0,
        expiredCount: expiredCount || 0,
        messagesToday: messagesToday || 0,
        expiringSoon: expiringSoon || [],
      },
    });
  } catch (err: any) {
    console.error('Stats API Error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}