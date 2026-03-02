import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createAdminClient();

    // 1. Clients stats
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('status, trial_ends_at');

    if (clientsError) throw clientsError;

    // 2. Messages today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count: messagesToday, error: messagesError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today.toISOString());

    if (messagesError) throw messagesError;

    const activeCount = clients?.filter(c => c.status === 'active').length || 0;
    const trialCount = clients?.filter(c => c.status === 'trial').length || 0;
    const expiredCount = clients?.filter(c => c.status === 'expired').length || 0;

    // 3. Expiring soon (24h)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const expiringSoon = clients?.filter(c => {
      if (!c.trial_ends_at || c.status !== 'trial') return false;
      const endDate = new Date(c.trial_ends_at);
      return endDate > new Date() && endDate <= tomorrow;
    }) || [];

    return NextResponse.json({
      activeCount,
      trialCount,
      expiredCount,
      messagesToday: messagesToday || 0,
      expiringSoon
    });

  } catch (error: any) {
    console.error('API Admin Stats GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
