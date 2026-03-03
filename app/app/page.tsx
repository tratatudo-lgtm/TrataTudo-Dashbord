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

import Link from 'next/link';
import { StatsCard } from '@/components/stats-card';
import DebugPanel from '@/components/debug-panel';
import { getBaseUrl } from '@/lib/baseUrl';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/admin/stats`;

  let stats = {
    totalCount: 0,
    activeCount: 0,
    trialCount: 0,
    expiredCount: 0,
    messagesToday: 0,
    expiringSoon: [],
  };

  let error: string | null = null;
  let hint: string | null = null;

  try {
    const res = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        'x-tratatudo-key': process.env.TRATATUDO_API_KEY || '',
      },
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      error = data.error || 'Erro ao carregar estatísticas';
      hint = data.hint || 'Verifica permissões ou variáveis de ambiente.';
    } else {
      stats = data.data || stats;
    }
  } catch (err: any) {
    error = err.message || 'Erro crítico durante renderização.';
    hint = 'Verifica logs do servidor.';
  }

  const {
    totalCount,
    activeCount,
    trialCount,
    expiredCount,
    messagesToday,
    expiringSoon,
  } = stats;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Bem-vindo ao TrataTudo. Aqui está o resumo da sua operação.
        </p>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-rose-900 font-bold">Erro ao carregar dados</h3>
            <p className="text-rose-700 text-sm mt-1">{error}</p>
            {hint && (
              <p className="text-rose-600 text-xs mt-2 font-medium">
                💡 Sugestão: {hint}
              </p>
            )}
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
        <StatsCard
          title="Em Trial"
          value={trialCount || 0}
          icon={Clock}
          color="indigo"
        />
        <StatsCard
          title="Expirados"
          value={expiredCount || 0}
          icon={AlertCircle}
          color="rose"
        />
        <StatsCard
          title="Mensagens Hoje"
          value={messagesToday || 0}
          icon={MessageSquare}
          color="blue"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Alertas */}
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
                        {new Date(client.trial_end).toLocaleTimeString(
                          'pt-PT',
                          { hour: '2-digit', minute: '2-digit' }
                        )}
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
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          <section className="bg-slate-900 rounded-2xl p-8 text-white shadow-xl">
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
        </div>
      </div>

      <DebugPanel
        title="Debug Dashboard"
        endpoint={endpoint}
        error={error || undefined}
        hint={hint || undefined}
        data={stats}
      />
    </div>
  );
}