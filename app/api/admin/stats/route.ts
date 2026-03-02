import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem ver estatísticas.' }, { status: authStatus });
    }

    const supabase = createAdminClient();

    // 1. Clients stats - wrap in try/catch to handle missing table
    let clients: any[] = [];
    try {
      const { data, error: clientsError } = await supabase
        .from('clients')
        .select('status, trial_ends_at, name, company_name, id, trial_end');
      
      if (clientsError) {
        console.error('Supabase Clients Stats Error:', clientsError);
      } else {
        clients = data || [];
      }
    } catch (e) {
      console.error('Critical Clients Stats Error:', e);
    }

    // 2. Messages today - wrap in try/catch to handle missing table
    let messagesToday = 0;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count, error: messagesError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      if (messagesError) {
        console.error('Supabase Messages Stats Error:', messagesError);
      } else {
        messagesToday = count || 0;
      }
    } catch (e) {
      console.error('Critical Messages Stats Error:', e);
    }

    const activeCount = clients?.filter(c => c.status === 'active').length || 0;
    const trialCount = clients?.filter(c => c.status === 'trial').length || 0;
    const expiredCount = clients?.filter(c => c.status === 'expired').length || 0;

    // 3. Expiring soon (24h)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const expiringSoon = clients?.filter(c => {
      const endDateStr = c.trial_ends_at || c.trial_end;
      if (!endDateStr || c.status !== 'trial') return false;
      const endDate = new Date(endDateStr);
      return endDate > new Date() && endDate <= tomorrow;
    }) || [];

    return NextResponse.json({
      activeCount,
      trialCount,
      expiredCount,
      messagesToday,
      expiringSoon
    });

  } catch (error: any) {
    console.error('API Admin Stats GET Error:', error);
    return NextResponse.json({ 
      error: error.message,
      hint: 'Verifique se as tabelas "clients" e "messages" foram criadas no Supabase.'
    }, { status: 500 });
  }
}
