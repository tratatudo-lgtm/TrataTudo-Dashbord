'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Edit2, ExternalLink, Copy, Zap, Search, Plus, Filter, AlertCircle, Users, Loader2 } from 'lucide-react';
import { ClientActionButtons } from '@/components/clients/client-action-buttons';
import { ClientQuickActions } from '@/components/clients/client-quick-actions';
import { useSearchParams, useRouter } from 'next/navigation';

export default function ClientsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const status = searchParams.get('status') || 'all';
  const query = searchParams.get('q') || '';

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = `/api/clients?status=${status}&q=${query}`;
      const res = await fetch(endpoint);
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

      setClients(json.data || []);
    } catch (err: any) {
      console.error('Error in ClientsPage:', err);
      setError(err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, [status, query]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const q = formData.get('q') as string;
    const params = new URLSearchParams(searchParams.toString());
    if (q) params.set('q', q);
    else params.delete('q');
    router.push(`/app/clients?${params.toString()}`);
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

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-rose-900 font-bold">Erro ao carregar dados</h3>
            <p className="text-rose-700 text-sm mt-1">{error}</p>
            <button 
              onClick={() => fetchClients()}
              className="mt-3 text-xs font-bold text-rose-600 hover:text-rose-800 underline"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <form onSubmit={handleSearch}>
            <input
              type="text"
              name="q"
              defaultValue={query}
              placeholder="Pesquisar por empresa ou telefone..."
              className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
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
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mb-2" />
                      <p className="text-slate-500 text-xs">A carregar clientes...</p>
                    </div>
                  </td>
                </tr>
              ) : clients.length > 0 ? (
                clients.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">
                        {client.company_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {String(client.id).substring(0, 8)}...</div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs">
                      {client.phone_e164}
                    </td>
                    <td className="px-6 py-4">
                      <code className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-600">
                        {client.instance_name || '-'}
                      </code>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        client.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        client.status === 'trial' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {client.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.trial_end ? (
                        <div className="flex flex-col">
                          <span className="text-slate-900 font-medium">
                            {new Date(client.trial_end).toLocaleDateString('pt-PT')}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(client.trial_end) < new Date() ? 'Expirado' : 'Válido'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ClientQuickActions client={client} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
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
    </div>
  );
}
