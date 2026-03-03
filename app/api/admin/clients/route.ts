import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

function daysDiffFromNow(trialEndIso?: string | null) {
  if (!trialEndIso) return null;
  const end = new Date(trialEndIso).getTime();
  const now = Date.now();
  const diffMs = end - now;
  // arredonda para cima quando ainda falta tempo; para baixo quando já passou
  const days = diffMs >= 0 ? Math.ceil(diffMs / 86400000) : Math.floor(diffMs / 86400000);
  return days;
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();

    // Auth: API key OU sessão (dashboard)
    const apiKeyOk = isValidApiKey(req);
    const { data: { session } } = await supabase.auth.getSession();

    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    // Se vier por sessão, garantir que é admin (tens tabela admins)
    if (!apiKeyOk && session?.user?.email) {
      const { data: adminRow, error: adminErr } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (adminErr) throw adminErr;
      if (!adminRow) {
        return NextResponse.json(
          { ok: false, error: 'Não autenticado', hint: 'Apenas administradores podem ver clientes.' },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status'); // trial|active|expired|all
    const q = (searchParams.get('q') || '').trim();

    let query = supabase
      .from('clients')
      .select('id, company_name, phone_e164, status, trial_end, trial_start, created_at, updated_at, instance_name, production_instance_name');

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (q) {
      // pesquisa por nome ou telefone
      query = query.or(`company_name.ilike.%${q}%,phone_e164.ilike.%${q}%`);
    }

    const { data, error } = await query.order('id', { ascending: false });

    if (error) throw error;

    const enriched = (data || []).map((c: any) => {
      const days_remaining = daysDiffFromNow(c.trial_end);
      const is_expired_by_date = c.trial_end ? new Date(c.trial_end).getTime() < Date.now() : false;

      // “estado efetivo” (para UI): se a data expirou, consideramos expirado mesmo que status esteja "active"
      const effective_status =
        is_expired_by_date ? 'expired' : (c.status || 'trial');

      return {
        ...c,
        days_remaining,
        is_expired_by_date,
        effective_status,
      };
    });

    return NextResponse.json({ ok: true, data: enriched });
  } catch (err: any) {
    console.error('API admin/clients error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}