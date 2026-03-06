'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Filter, AlertCircle, Users, Loader2, Server, Wifi, WifiOff } from 'lucide-react';
import { ClientActionButtons } from '@/components/clients/client-action-buttons';
import { ClientQuickActions } from '@/components/clients/client-quick-actions';
import { useSearchParams, useRouter } from 'next/navigation';

type ClientRow = {
  id?: number;
  client_id?: number;
  company_name?: string;
  phone_e164?: string;
  instance_name?: string | null;
  production_instance_name?: string | null;
  is_hub?: boolean | null;
  instance_status?: string | null;
  status?: string | null;
  trial_end?: string | null;
};

function getStatusBadgeClass(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    case 'trial':
      return 'bg-amber-100 text-amber-700 border border-amber-200';
    case 'expired':
      return 'bg-rose-100 text-rose-700 border border-rose-200';
    case 'inactive':
      return 'bg-zinc-100 text-zinc-700 border border-zinc-200';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

function getInstanceBadgeClass(isHub?: boolean | null) {
  if (isHub === true) {
    return 'bg-sky-100 text-sky-700 border border-sky-200';
  }
  if (isHub === false) {
    return 'bg-violet-100 text-violet-700 border border-violet-200';
  }
  return 'bg-slate-100 text-slate-700 border border-slate-200';
}

function getInstanceStatusBadgeClass(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'active':
      return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
    case 'inactive':
      return 'bg-zinc-100 text-zinc-700 border border-zinc-200';
    case 'connecting':
      return 'bg-amber-100 text-amber-700 border border-amber-200';
    case 'error':
      return 'bg-rose-100 text-rose-700 border border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

function formatDate(date?: string | null) {
  if (!date) return '-';

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '-';

  return parsed.toLocaleDateString('pt-PT');
}

export default function ClientsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const status = searchParams.get('status') || 'all';
  const query = searchParams.get('q') || '';

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);

    try {
      const endpoint = `/api/admin/clients?status=${encodeURIComponent(status)}&q=${encodeURIComponent(query)}`;
      const res = await fetch(endpoint, { cache: 'no-store' });
      const text = await res.text();

      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse clients JSON:', e, 'Raw text:', text);
        json = { ok: false, error: 'Resposta inválida do servidor (JSON malformado)' };
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Erro ao carregar clientes');
      }

      setClients(Array.isArray(json.data) ? json.data : []);
    } catch (err: any) {
      console.error('Error in ClientsPage:', err);
      setError(err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, query]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const q = String(formData.get('q') || '').trim();

    const params = new URLSearchParams(searchParams.toString());
    if (q) params.set('q', q);
    else params.delete('q');

    router.push(`/app/clients?${params.toString()}`);
  };

  const getDisplayInstanceName = (client: ClientRow) => {
    return client.production_instance_name || client.instance_name || '-';
  };

  const getInstanceModeLabel = (client: ClientRow) => {
    if (client.is_hub === true) return 'Hub Trial';
    if (client.is_hub === false) return 'Privada';
    return 'Sem instância';
  };

  const isTrialExpired = (trialEnd?: string | null) => {
    if (!trialEnd) return false;
    const parsed = new Date(trialEnd);
    if (Number.isNaN(parsed.getTime())) return false;
    return parsed < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie empresas, trials e instâncias do bot.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClientQuickActions onRefresh={fetchClients} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={handleSearch} className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-xl">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                defaultValue={query}
                placeholder="Pesquisar por empresa ou número"
                className="h-10 w-full rounded-xl border bg-background pl-9 pr-3 text-sm outline-none ring-0 transition focus:border-primary"
              />
            </div>

            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium hover:bg-accent"
            >
              Pesquisar
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {['all', 'trial', 'active', 'expired'].map((s) => {
              const active = status === s;
              return (
                <Link
                  key={s}
                  href={`/app/clients?status=${encodeURIComponent(s)}${query ? `&q=${encodeURIComponent(query)}` : ''}`}
                  className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'border hover:bg-accent'
                  }`}
                >
                  {s === 'all' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold">Erro ao carregar dados</h3>
              <p className="mt-1 text-sm">{error}</p>
              <button
                onClick={() => fetchClients()}
                className="mt-3 text-xs font-bold underline hover:text-rose-800"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{loading ? 'A carregar...' : `${clients.length} cliente(s)`}</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>A carregar clientes...</span>
          </div>
        ) : clients.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">Telefone (E.164)</th>
                  <th className="px-4 py-3 font-medium">Instância</th>
                  <th className="px-4 py-3 font-medium">Modo</th>
                  <th className="px-4 py-3 font-medium">Estado da instância</th>
                  <th className="px-4 py-3 font-medium">Estado do cliente</th>
                  <th className="px-4 py-3 font-medium">Expira em</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>

              <tbody>
                {clients.map((client) => {
                  const displayId = String(client.id ?? client.client_id ?? '-');
                  const expired = isTrialExpired(client.trial_end);

                  return (
                    <tr key={displayId} className="border-b last:border-b-0">
                      <td className="px-4 py-4 align-top">
                        <div className="font-medium">{client.company_name || '-'}</div>
                        <div className="mt-1 text-xs text-muted-foreground">ID: {displayId}</div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span className="font-mono text-xs sm:text-sm">
                          {client.phone_e164 || '-'}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <div className="inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-1.5">
                          <Server className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-xs sm:text-sm">
                            {getDisplayInstanceName(client)}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getInstanceBadgeClass(
                            client.is_hub
                          )}`}
                        >
                          {getInstanceModeLabel(client)}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${getInstanceStatusBadgeClass(
                            client.instance_status
                          )}`}
                        >
                          {String(client.instance_status || '').toLowerCase() === 'active' ? (
                            <Wifi className="h-3.5 w-3.5" />
                          ) : (
                            <WifiOff className="h-3.5 w-3.5" />
                          )}
                          {client.instance_status || 'N/A'}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClass(
                            client.status
                          )}`}
                        >
                          {client.status || 'N/A'}
                        </span>
                      </td>

                      <td className="px-4 py-4 align-top">
                        {client.trial_end ? (
                          <div className="space-y-1">
                            <div>{formatDate(client.trial_end)}</div>
                            <div
                              className={`text-xs font-medium ${
                                expired ? 'text-rose-600' : 'text-emerald-600'
                              }`}
                            >
                              {expired ? 'Expirado' : 'Válido'}
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>

                      <td className="px-4 py-4 align-top">
                        <ClientActionButtons
                          client={{
                            ...client,
                            id: client.id ?? client.client_id,
                          }}
                          onUpdated={fetchClients}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">Nenhum cliente encontrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tente ajustar os filtros ou criar um novo cliente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}