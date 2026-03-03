import Link from 'next/link';
import { headers } from 'next/headers';
import { Users, MessageSquare, Clock, AlertCircle, ChevronRight, Plus, Settings } from 'lucide-react';

import { StatsCard } from '@/components/stats-card';
import DebugPanel from '@/components/debug-panel';

export const dynamic = 'force-dynamic';

function resolveBaseUrl() {
  // 1) se definires na Vercel (recomendado): https://trata-tudo-dashbord.vercel.app
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && site.startsWith('http')) return site.replace(/\/$/, '');

  // 2) Vercel fornece VERCEL_URL sem protocolo
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  // 3) fallback por headers
  const h = headers();
  const proto = h.get('x-forwarded-proto') || 'https';
  const host = h.get('x-forwarded-host') || h.get('host');
  if (host) return `${proto}://${host}`;

  // 4) último fallback fixo
  return 'https://trata-tudo-dashbord.vercel.app';
}

export default async function DashboardPage() {
  const baseUrl = resolveBaseUrl();
  const endpoint = `${baseUrl}/api/admin/stats`;

  let stats: any = {
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
    const res = await fetch(endpoint, { cache: 'no-store' });
    const text = await res.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { ok: false, error: 'Resposta inválida do servidor (JSON malformado)' };
    }

    if (res.ok && json.ok) {
      stats = json.data || stats;
    } else {
      error = json.error || 'Erro ao carregar estatísticas';
      if (res.status === 401) {
        hint = 'Não autenticado como admin. Faz login e garante que o teu utilizador está na tabela "admins".';
      } else {
        hint = 'Verifica RLS/permissões e se as tabelas existem.';
      }
    }
  } catch (e: any) {
    error = e?.message || 'Erro inesperado no servidor';
    hint = 'Falha no SSR fetch. Verifica o endpoint/baseUrl.';
  }

  const totalCount = stats.totalCount || 0;
  const activeCount = stats.activeCount || 0;
  const trialCount = stats.trialCount || 0;
  const expiredCount = stats.expiredCount || 0;
  const messagesToday = stats.messagesToday || 0;
  const expiringSoon: any[] = Array.isArray(stats.expiringSoon) ? stats.expiringSoon : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Resumo do sistema TrataTudo.</p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-900">Erro ao carregar dados</div>
              <div className="text-sm text-rose-700 mt-1">{error}</div>
              {hint && <div className="text-xs text-rose-700 mt-2">💡 {hint}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Total Clientes" value={totalCount} icon={Users} color="emerald" trend={`${activeCount} ativos`} />
        <StatsCard title="Em Trial" value={trialCount} icon={Clock} color="indigo" />
        <StatsCard title="Expirados" value={expiredCount} icon={AlertCircle} color="rose" />
        <StatsCard title="Mensagens Hoje" value={messagesToday} icon={MessageSquare} color="blue" />
      </div>

      {/* Expirações */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Alertas de expiração (24h)
          </div>
          <div className="text-xs text-muted-foreground">{expiringSoon.length} críticos</div>
        </div>

        <div className="divide-y">
          {expiringSoon.map((c: any, i: number) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{c.company_name || c.name || `Cliente ${c.id}`}</div>
                <div className="text-xs text-muted-foreground">
                  Expira: {new Date(c.trial_ends_at || c.trial_end).toLocaleString('pt-PT')}
                </div>
              </div>
              <Link href={`/app/clients/${c.id}`} className="text-sm text-indigo-600 flex items-center gap-1">
                Ver <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ))}

          {expiringSoon.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Nenhum cliente expira nas próximas 24 horas.</div>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/app/clients" className="rounded-2xl border bg-card p-4 flex items-center gap-3">
          <Plus className="h-5 w-5" />
          <div>
            <div className="font-medium">Novo Cliente</div>
            <div className="text-xs text-muted-foreground">Adicionar empresa e bot</div>
          </div>
        </Link>

        <Link href="/app/messages" className="rounded-2xl border bg-card p-4 flex items-center gap-3">
          <MessageSquare className="h-5 w-5" />
          <div>
            <div className="font-medium">Mensagens</div>
            <div className="text-xs text-muted-foreground">Histórico global</div>
          </div>
        </Link>

        <Link href="/app/settings" className="rounded-2xl border bg-card p-4 flex items-center gap-3">
          <Settings className="h-5 w-5" />
          <div>
            <div className="font-medium">Configurações</div>
            <div className="text-xs text-muted-foreground">APIs e sistema</div>
          </div>
        </Link>
      </div>

      <DebugPanel
        title="Debug Dashboard"
        endpoint={endpoint}
        error={error}
        hint={hint}
        data={{ baseUrl, endpoint, stats }}
      />
    </div>
  );
}