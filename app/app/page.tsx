import Link from 'next/link';
import {
  Users,
  MessageSquare,
  Zap,
  Clock,
  TrendingUp,
  AlertCircle,
  Plus,
  Settings,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/server';
import { StatsCard } from '@/components/stats-card';
import DebugPanel from '@/components/debug-panel';

export const dynamic = 'force-dynamic';

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

export default async function DashboardPage() {
  const supabase = createClient();

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;

  let stats = {
    totalCount: 0,
    activeCount: 0,
    trialCount: 0,
    expiredCount: 0,
    messagesToday: 0,
    expiringSoon: [] as any[],
  };

  let error: string | null = null;
  let hint: string | null = null;

  try {
    if (!session) {
      error = 'Não autenticado';
      hint = 'Faz login na dashboard para ver estatísticas.';
      throw new Error('no-session');
    }

    // 1) Confirmar se é admin (RLS + tabela admins)
    const adminCheck = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (adminCheck.error) throw adminCheck.error;

    if (!adminCheck.data) {
      error = 'Não autenticado';
      hint = 'Apenas administradores podem ver estatísticas.';
      throw new Error('not-admin');
    }

    // 2) Contagens de clientes
    const totalRes = await supabase.from('clients').select('id', { count: 'exact', head: true });
    if (totalRes.error) throw totalRes.error;

    const activeRes = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (activeRes.error) throw activeRes.error;

    const trialRes = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'trial');
    if (trialRes.error) throw trialRes.error;

    // Expirados: status='expired' OU trial_end < agora
    const nowISO = new Date().toISOString();

    const expiredStatusRes = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'expired');
    if (expiredStatusRes.error) throw expiredStatusRes.error;

    const expiredTrialRes = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'trial')
      .lt('trial_end', nowISO);
    if (expiredTrialRes.error) throw expiredTrialRes.error;

    // 3) Mensagens hoje (wa_messages)
    const todayISO = startOfTodayISO();
    const msgsRes = await supabase
      .from('wa_messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayISO);
    if (msgsRes.error) throw msgsRes.error;

    // 4) Expira em 24h (trial_end entre agora e +24h)
    const soonISO = addHoursISO(24);
    const soonRes = await supabase
      .from('clients')
      .select('id, company_name, status, trial_end')
      .eq('status', 'trial')
      .gte('trial_end', nowISO)
      .lte('trial_end', soonISO)
      .order('trial_end', { ascending: true })
      .limit(20);
    if (soonRes.error) throw soonRes.error;

    stats = {
      totalCount: totalRes.count || 0,
      activeCount: activeRes.count || 0,
      trialCount: trialRes.count || 0,
      expiredCount: (expiredStatusRes.count || 0) + (expiredTrialRes.count || 0),
      messagesToday: msgsRes.count || 0,
      expiringSoon: soonRes.data || [],
    };
  } catch (e: any) {
    if (!error) {
      error = e?.message || 'Erro inesperado';
      hint = 'Verifica permissões (RLS) e se as tabelas existem.';
    }
  }

  const { totalCount, activeCount, trialCount, expiredCount, messagesToday, expiringSoon } = stats;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Bem-vindo ao TrataTudo. Aqui está o resumo da tua operação.</p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-rose-900 font-bold">Erro ao carregar dados</h3>
            <p className="text-rose-700 text-sm mt-1">{error}</p>
            {hint && <p className="text-rose-600 text-xs mt-2 font-medium">💡 Sugestão: {hint}</p>}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Clientes"
          value={totalCount || 0}
          icon={Users}
          color="emerald"
          trend={`${activeCount || 0} ativos`}
        />
        <StatsCard title="Em Trial" value={trialCount || 0} icon={Clock} color="indigo" />
        <StatsCard title="Expirados" value={expiredCount || 0} icon={AlertCircle} color="rose" />
        <StatsCard
          title="Mensagens Hoje"
          value={messagesToday || 0}
          icon={MessageSquare}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Alertas de Expiração (24h)
              </h2>
              <span className="px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full uppercase">
                {expiringSoon.length} Críticos
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {expiringSoon.map((client: any, i: number) => (
                <div
                  key={i}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {client.company_name || `Cliente ${client.id}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        Expira em{' '}
                        {new Date(client.trial_end).toLocaleTimeString('pt-PT', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  <Link
                    href={`/app/clients/${client.id}`}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    Ver <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              ))}

              {expiringSoon.length === 0 && (
                <div className="p-12 text-center text-slate-400 italic text-sm">
                  Nenhum cliente expira nas próximas 24 horas.
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link
              href="/app/clients"
              className="bg-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition group"
            >
              <Plus className="h-8 w-8 mb-4 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold">Novo Cliente</h3>
              <p className="text-indigo-100 text-xs mt-1">Adicionar empresa e bot</p>
            </Link>

            <Link
              href="/app/messages"
              className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-indigo-300 transition group"
            >
              <MessageSquare className="h-8 w-8 mb-4 text-indigo-600 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-slate-900">Ver Mensagens</h3>
              <p className="text-slate-500 text-xs mt-1">Histórico global</p>
            </Link>

            <Link
              href="/app/settings"
              className="bg-white p-6 rounded-2xl border border-slate-200 hover:border-indigo-300 transition group"
            >
              <Settings className="h-8 w-8 mb-4 text-slate-400 group-hover:scale-110 transition-transform" />
              <h3 className="font-bold text-slate-900">Configurar APIs</h3>
              <p className="text-slate-500 text-xs mt-1">Estado do sistema</p>
            </Link>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <section className="bg-slate-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <TrendingUp className="h-24 w-24" />
            </div>

            <h3 className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-6">
              Performance Hoje
            </h3>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Taxa de Resposta</span>
                  <span className="font-bold">98%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[98%] bg-emerald-500 rounded-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Conversão Trial</span>
                  <span className="font-bold">45%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[45%] bg-indigo-500 rounded-full"></div>
                </div>
              </div>
            </div>

            <button className="w-full mt-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2">
              Ver Relatório Completo <ArrowUpRight className="h-3 w-3" />
            </button>
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-slate-900 font-bold mb-4">Dica do Dia</h3>
            <div className="flex gap-4">
              <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                <Zap className="h-5 w-5" />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Bots com prompts que incluem o horário de funcionamento da empresa têm 30% menos
                intervenção humana necessária.
              </p>
            </div>
          </section>
        </div>
      </div>

      <DebugPanel
        title="Debug Dashboard"
        endpoint="(Supabase direto - sem /api/admin/stats)"
        error={error || undefined}
        hint={hint || undefined}
        data={stats}
      />
    </div>
  );
}