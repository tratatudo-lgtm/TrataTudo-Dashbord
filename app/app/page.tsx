import { 
  Users, MessageSquare, Zap, Clock, 
  TrendingUp, AlertCircle, Plus, Settings, 
  ChevronRight, ArrowUpRight, Terminal
} from 'lucide-react';
import Link from 'next/link';
import { StatsCard } from '@/components/stats-card';
import { DebugPanel } from '@/components/debug-panel';
import { getBaseUrl } from '@/lib/baseUrl';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const baseUrl = getBaseUrl();
  const endpoint = `${baseUrl}/api/admin/stats`;
  
  let stats = {
    activeCount: 0,
    trialCount: 0,
    expiredCount: 0,
    messagesToday: 0,
    expiringSoon: []
  };
  let error: string | null = null;
  let hint: string | undefined = undefined;

  try {
    const res = await fetch(endpoint, { cache: 'no-store' });
    
    // Check if response is valid JSON
    let data: any = {};
    try {
      data = await res.json();
    } catch (e) {
      console.error('Failed to parse stats JSON:', e);
      data = { error: 'Resposta inválida do servidor (JSON malformado)' };
    }

    if (res.ok) {
      stats = data;
    } else {
      const errorMsg = data.error || 'Erro ao carregar estatísticas';
      const isPermissionError = errorMsg.toLowerCase().includes('permission') || 
                               errorMsg.toLowerCase().includes('rls') || 
                               errorMsg.toLowerCase().includes('policy') ||
                               errorMsg.toLowerCase().includes('not found') ||
                               errorMsg.toLowerCase().includes('relation');
      
      error = errorMsg;
      if (isPermissionError) {
        hint = 'Sem permissões ou tabela inexistente. Verifique as políticas de RLS e se as tabelas "clients" e "messages" foram criadas.';
      } else {
        hint = 'Verifique a ligação à base de dados e as variáveis de ambiente.';
      }
      console.error('Stats API Error:', { status: res.status, data });
    }
  } catch (err: any) {
    console.error('Critical Error in DashboardPage SSR:', err);
    error = err.message || 'Ocorreu um erro inesperado no servidor.';
    hint = 'Erro crítico durante a renderização. Verifique os logs do servidor.';
  }

  const { activeCount, trialCount, expiredCount, messagesToday, expiringSoon } = stats;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Bem-vindo ao TrataTudo. Aqui está o resumo da sua operação.</p>
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
          title="Clientes Ativos" 
          value={activeCount} 
          icon={Users} 
          color="emerald" 
          trend="+2 este mês"
        />
        <StatsCard 
          title="Em Trial" 
          value={trialCount} 
          icon={Clock} 
          color="indigo" 
        />
        <StatsCard 
          title="Expirados" 
          value={expiredCount} 
          icon={AlertCircle} 
          color="rose" 
        />
        <StatsCard 
          title="Mensagens Hoje" 
          value={messagesToday || 0} 
          icon={MessageSquare} 
          color="blue" 
          trend="+12% vs ontem"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content: Alerts & Recent */}
        <div className="lg:col-span-2 space-y-8">
          {/* Alertas */}
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
              {expiringSoon.map((client: any, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{client.company_name || client.name}</p>
                      <p className="text-xs text-slate-500">Expira em {new Date(client.trial_ends_at || client.trial_end).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                  <Link 
                    href={`/app/clients/${client.id}`}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    Renovar <ChevronRight className="h-3 w-3" />
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

          {/* Ações Rápidas */}
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

        {/* Sidebar: Activity/Insights */}
        <div className="space-y-8">
          <section className="bg-slate-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <TrendingUp className="h-24 w-24" />
            </div>
            <h3 className="text-indigo-400 text-xs font-bold uppercase tracking-widest mb-6">Performance Hoje</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Taxa de Resposta</span>
                  <span className="font-bold">98%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[98%] bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-slate-400">Conversão Trial</span>
                  <span className="font-bold">45%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full w-[45%] bg-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
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
                Bots com prompts que incluem o horário de funcionamento da empresa têm 30% menos intervenção humana necessária.
              </p>
            </div>
          </section>
        </div>
      </div>
      <DebugPanel endpoint={endpoint} error={error} hint={hint} data={stats} />
    </div>
  );
}
