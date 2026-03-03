import {
  Users,
  MessageSquare,
  Clock,
  AlertCircle,
  Plus,
  Settings,
  Terminal,
} from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';

import { StatsCard } from '@/components/stats-card';
import { DebugPanel } from '@/components/debug-panel';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const endpoint = `/api/admin/stats`;

  let stats: any = {
    totalCount: 0,
    activeCount: 0,
    trialCount: 0,
    expiredCount: 0,
    messagesToday: 0,
    expiringSoon: [],
  };

  let error: string | null = null;
  let hint: string | undefined = undefined;

  try {
    // ✅ IMPORTANT: forward cookies to keep Supabase session on SSR fetch
    const cookieHeader = cookies()
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

    const res = await fetch(endpoint, {
      cache: 'no-store',
      headers: {
        cookie: cookieHeader,
      },
    });

    const text = await res.text();

    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse stats JSON:', e, 'Raw text:', text);
      data = { ok: false, error: 'Resposta inválida do servidor (JSON malformado)' };
    }

    if (res.ok && data.ok) {
      stats = data.data || stats;
    } else {
      const errorMsg = data.error || 'Erro ao carregar estatísticas';

      const isPermissionError =
        errorMsg.toLowerCase().includes('permission') ||
        errorMsg.toLowerCase().includes('rls') ||
        errorMsg.toLowerCase().includes('policy') ||
        errorMsg.toLowerCase().includes('not found') ||
        errorMsg.toLowerCase().includes('relation') ||
        res.status === 401;

      error = errorMsg;

      if (res.status === 401) {
        hint = 'Sem sessão no servidor. Esta correção envia cookies para a API no SSR.';
      } else if (isPermissionError) {
        hint =
          'Sem permissões ou tabela inexistente. Verifique as políticas de RLS e se as tabelas "clients" e "messages" foram criadas.';
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

  const {
    totalCount,
    activeCount,
    trialCount,
    expiredCount,
    messagesToday,
    expiringSoon,
  } = stats;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          Bem-vindo ao TrataTudo. Aqui está o resumo da sua operação.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="space-y-1">
              <div className="font-medium text-red-800">Erro ao carregar dados</div>
              <div className="text-red-700">{error}</div>
              {hint && (
                <div className="text-sm text-red-700">
                  <span className="font-medium">Sugestão:</span> {hint}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StatsCard title="Total Clientes" value={totalCount} icon={Users} />
        <StatsCard title="Em Trial" value={trialCount} icon={Clock} />
        <StatsCard title="Expirados" value={expiredCount} icon={AlertCircle} />
        <StatsCard title="Mensagens Hoje" value={messagesToday} icon={MessageSquare} />
      </div>

      {/* Alertas */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Alertas de Expiração (24h)</h2>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{expiringSoon?.length || 0}</span> Críticos
          </div>
        </div>

        <div className="space-y-2">
          {(expiringSoon || []).map((client: any, i: number) => (
            <div
              key={`${client.id || i}`}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <div className="space-y-0.5">
                <div className="font-medium">
                  {client.company_name || client.name || `Cliente ${client.id}`}
                </div>
                <div className="text-sm text-muted-foreground">
                  Expira em{' '}
                  {new Date(client.trial_ends_at || client.trial_end).toLocaleTimeString(
                    'pt-PT',
                    { hour: '2-digit', minute: '2-digit' }
                  )}
                </div>
              </div>
              <Link
                href="/app/clients"
                className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                Renovar
              </Link>
            </div>
          ))}

          {(expiringSoon?.length || 0) === 0 && (
            <div className="text-sm text-muted-foreground">
              Nenhum cliente expira nas próximas 24 horas.
            </div>
          )}
        </div>
      </div>

      {/* Ações Rápidas */}
      <div className="grid grid-cols-1 gap-4">
        <Link href="/app/clients" className="rounded-2xl border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium">Novo Cliente</div>
            <div className="text-sm text-muted-foreground">Adicionar empresa e bot</div>
          </div>
        </Link>

        <Link href="/app/messages" className="rounded-2xl border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium">Ver Mensagens</div>
            <div className="text-sm text-muted-foreground">Histórico global</div>
          </div>
        </Link>

        <Link href="/app/settings" className="rounded-2xl border bg-card p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <div className="font-medium">Configurar APIs</div>
            <div className="text-sm text-muted-foreground">Estado do sistema</div>
          </div>
        </Link>
      </div>

      <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Terminal className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium">Dica do Dia</div>
          <div className="text-sm text-muted-foreground">
            Bots com prompts que incluem o horário de funcionamento da empresa têm 30% menos intervenção humana necessária.
          </div>
        </div>
      </div>

      <DebugPanel />
    </div>
  );
}