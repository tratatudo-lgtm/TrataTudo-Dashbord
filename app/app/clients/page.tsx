import Link from 'next/link';
import { Edit2, ExternalLink, Copy, Zap, Search, Plus, Filter, AlertCircle } from 'lucide-react';
import { ClientActionButtons } from '@/components/clients/client-action-buttons';
import { ClientQuickActions } from '@/components/clients/client-quick-actions';
import { DebugPanel } from '@/components/debug-panel';

export const dynamic = 'force-dynamic';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const status = searchParams.status || 'all';
  const query = searchParams.q || '';

  // Get base URL for server-side fetch
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  const endpoint = `${baseUrl}/api/admin/clients?status=${status}&q=${query}`;
  
  let clients: any[] = [];
  let error: string | null = null;
  let hint: string | undefined = undefined;

  try {
    const res = await fetch(endpoint, {
      cache: 'no-store'
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao carregar clientes');
    }
    clients = data;
  } catch (err: any) {
    console.error('Error fetching clients:', err);
    error = err.message;
    hint = 'Verifique se a tabela "clients" existe e se a chave SUPABASE_SERVICE_ROLE_KEY está configurada.';
  }

  const renderCell = (client: any, keys: string[]) => {
    for (const key of keys) {
      if (client[key] !== undefined && client[key] !== null) return client[key];
    }
    return <span className="text-rose-500 italic text-[10px]">coluna em falta</span>;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie as empresas e instâncias do bot.</p>
        </div>
        <ClientActionButtons />
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <form action="/app/clients" method="GET">
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Pesquisar por empresa ou telefone..."
              className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            {status !== 'all' && <input type="hidden" name="status" value={status} />}
          </form>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          {['all', 'trial', 'active', 'expired'].map((s) => (
            <Link
              key={s}
              href={`/app/clients?status=${s}${query ? `&q=${query}` : ''}`}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition ${
                status === s
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {s === 'all' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
            </Link>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-white border border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Empresa</th>
                <th className="px-6 py-4">Telefone (E.164)</th>
                <th className="px-6 py-4">Instância</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Expira em</th>
                <th className="px-6 py-4">Última Atualiz.</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {clients?.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">
                      {renderCell(client, ['company_name', 'name'])}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {client.id.substring(0, 8)}...</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">
                    {renderCell(client, ['phone_e164', 'phone'])}
                  </td>
                  <td className="px-6 py-4">
                    <code className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-600">
                      {renderCell(client, ['instance_name'])}
                    </code>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      client.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      client.status === 'trial' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {client.status || <span className="text-rose-500 italic text-[10px]">coluna em falta</span>}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {client.trial_ends_at || client.trial_end ? (
                      <div className="flex flex-col">
                        <span className="text-slate-900 font-medium">
                          {new Date(client.trial_ends_at || client.trial_end).toLocaleDateString('pt-PT')}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(client.trial_ends_at || client.trial_end) < new Date() ? 'Expirado' : 'Válido'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {client.updated_at ? new Date(client.updated_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ClientQuickActions client={client} />
                  </td>
                </tr>
              ))}
              {(!clients || clients.length === 0) && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <Users className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium">Nenhum cliente encontrado.</p>
                      <p className="text-slate-400 text-xs mt-1">Tente ajustar os filtros ou criar um novo cliente.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DebugPanel endpoint={endpoint} error={error} hint={hint} data={clients} />
    </div>
  );
}

function Users(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
