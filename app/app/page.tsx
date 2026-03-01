import { createClient } from '@/lib/supabase/server';
import { StatsCard } from '@/components/stats-card';
import { Users, MessageSquare, Clock, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();

  // Fetch summary data (using fallback column names)
  const { count: activeCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  const { count: trialCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'trial');

  const { count: expiredCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'expired');

  const { count: messagesToday } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date().toISOString().split('T')[0]);

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Clientes Ativos"
          value={activeCount || 0}
          icon={<Users className="h-6 w-6 text-emerald-600" />}
          color="emerald"
        />
        <StatsCard
          title="Em Trial"
          value={trialCount || 0}
          icon={<Clock className="h-6 w-6 text-indigo-600" />}
          color="indigo"
        />
        <StatsCard
          title="Expirados"
          value={expiredCount || 0}
          icon={<AlertCircle className="h-6 w-6 text-rose-600" />}
          color="rose"
        />
        <StatsCard
          title="Mensagens Hoje"
          value={messagesToday || 0}
          icon={<MessageSquare className="h-6 w-6 text-amber-600" />}
          color="amber"
        />
      </div>

      <div className="mt-12 rounded-2xl bg-white p-8 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold">Atividade Recente</h2>
        <p className="text-slate-500">As últimas interações dos bots aparecerão aqui.</p>
        {/* Adicionar tabela de mensagens recentes aqui */}
      </div>
    </div>
  );
}
