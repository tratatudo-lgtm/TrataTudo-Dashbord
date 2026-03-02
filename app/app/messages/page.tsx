'use client';

import { 
  MessageSquare, Search, Filter, Calendar, 
  ChevronLeft, ChevronRight, UserPlus, ExternalLink,
  ArrowUpRight, ArrowDownLeft, Phone, AlertCircle, Loader2
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { MessageRow } from '@/components/messages/message-row';
import { DebugPanel } from '@/components/debug-panel';

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const query = searchParams.get('q') || '';
  const phone = searchParams.get('phone') || '';
  const instance = searchParams.get('instance') || '';
  const direction = searchParams.get('direction') || 'all';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = 50;

  const [messages, setMessages] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | undefined>(undefined);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(undefined);
    
    const endpoint = `/api/messages?q=${encodeURIComponent(query)}&phone=${encodeURIComponent(phone)}&instance=${encodeURIComponent(instance)}&direction=${direction}&page=${page}&limit=${pageSize}`;
    
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      
      if (!res.ok) {
        const errorMsg = data.error || 'Erro ao carregar mensagens';
        setError(errorMsg);
        if (errorMsg.toLowerCase().includes('permission') || errorMsg.toLowerCase().includes('rls') || errorMsg.toLowerCase().includes('relation')) {
          setHint('Sem permissões ou tabela inexistente. Verifique as políticas de RLS e se a tabela "messages" foi criada.');
        } else {
          setHint('Verifique a ligação à base de dados e as variáveis de ambiente.');
        }
      } else {
        setMessages(data.messages || []);
        setCount(data.count || 0);
      }
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      setError(err.message || 'Ocorreu um erro inesperado ao carregar as mensagens.');
    } finally {
      setLoading(false);
    }
  }, [query, phone, instance, direction, page, pageSize]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clients');
      if (res.ok) {
        const data = await res.json();
        setClients(data || []);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
    fetchClients();
  }, [fetchMessages, fetchClients]);

  const updateFilters = (newFilters: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    // Reset page on filter change
    if (!newFilters.page) params.set('page', '1');
    router.push(`/app/messages?${params.toString()}`);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Mensagens</h1>
        <p className="text-slate-500 mt-1">Histórico global de interações de todos os bots.</p>
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

      {/* Filters Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              updateFilters({ q: formData.get('q') as string });
            }}>
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Pesquisar no conteúdo das mensagens..."
                className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </form>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <select 
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              onChange={(e) => updateFilters({ phone: e.target.value })}
              value={phone}
            >
              <option value="">Todos os Clientes</option>
              {clients?.map(c => (
                <option key={c.id} value={c.phone_e164}>{c.company_name}</option>
              ))}
            </select>

            <select 
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              onChange={(e) => updateFilters({ direction: e.target.value })}
              value={direction}
            >
              <option value="all">Todas as Direções</option>
              <option value="in">Recebidas</option>
              <option value="out">Enviadas</option>
            </select>
          </div>
        </div>
      </div>

      {/* Messages List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
              <p className="text-xs text-slate-500 font-medium">A carregar mensagens...</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Data / Hora</th>
                <th className="px-6 py-4">Cliente / Telefone</th>
                <th className="px-6 py-4">Direção</th>
                <th className="px-6 py-4">Mensagem</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {messages?.map((msg) => (
                <MessageRow key={msg.id} message={msg} clients={clients || []} />
              ))}
              {!loading && (!messages || messages.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
                        <MessageSquare className="h-6 w-6" />
                      </div>
                      <p className="text-slate-500 font-medium">Nenhuma mensagem encontrada.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {count > pageSize && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <p className="text-xs text-slate-500">
              A mostrar <span className="font-bold">{(page - 1) * pageSize + 1}</span> a <span className="font-bold">{Math.min(page * pageSize, count)}</span> de <span className="font-bold">{count}</span> mensagens
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => updateFilters({ page: (page - 1).toString() })}
                disabled={page === 1 || loading}
                className={`p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50 disabled:pointer-events-none`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => updateFilters({ page: (page + 1).toString() })}
                disabled={page * pageSize >= count || loading}
                className={`p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition disabled:opacity-50 disabled:pointer-events-none`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      <DebugPanel endpoint={`/api/messages`} error={error} hint={hint} data={messages} />
    </div>
  );
}
