import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();

    // 1) Permitir modo "API key" (server-to-server / testes)
    const apiKeyOk = isValidApiKey(req);

    // 2) Ou permitir modo "sessão" (admin logado)
    const { data: { session } } = await supabase.auth.getSession();

    if (!apiKeyOk && !session) {
      return NextResponse.json(
        { ok: false, error: 'Não autenticado', hint: 'Apenas administradores podem ver estatísticas.' },
        { status: 401 }
      );
    }

    // Se tiver sessão, confirmar que é admin (se tiveres tabela admins)
    if (!apiKeyOk && session?.user?.email) {
      const { data: adminRow, error: adminErr } = await supabase
        .from('admins')
        .select('id')
        .eq('email', session.user.email)
        .maybeSingle();

      if (adminErr) throw adminErr;
      if (!adminRow) {
        return NextResponse.json(
          { ok: false, error: 'Não autenticado', hint: 'Apenas administradores podem ver estatísticas.' },
          { status: 401 }
        );
      }
    }

    // --- STATS ---
    // Ajusta aqui conforme o que queres mostrar.
    const { count: totalClients, error: e1 } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true });

    if (e1) throw e1;

    const { count: trialClients, error: e2 } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'trial');

    if (e2) throw e2;

    const { count: activeClients, error: e3 } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (e3) throw e3;

    const { count: expiredClients, error: e4 } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'expired');

    // Se não tiveres "expired", isto pode dar 0 — ok.
    if (e4) throw e4;

    return NextResponse.json({
      ok: true,
      data: {
        totalClients: totalClients || 0,
        trialClients: trialClients || 0,
        activeClients: activeClients || 0,
        expiredClients: expiredClients || 0,
      },
    });
  } catch (err: any) {
    console.error('Stats API Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}