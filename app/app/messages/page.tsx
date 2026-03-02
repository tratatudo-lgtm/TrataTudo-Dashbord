import { 
  MessageSquare, Search, Filter, Calendar, 
  ChevronLeft, ChevronRight, UserPlus, ExternalLink,
  ArrowUpRight, ArrowDownLeft, Phone, AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { MessageRow } from '@/components/messages/message-row';
import { DebugPanel } from '@/components/debug-panel';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { 
    q?: string; 
    phone?: string; 
    instance?: string; 
    direction?: string;
    page?: string;
  };
}) {
  const query = searchParams.q || '';
  const phone = searchParams.phone || '';
  const instance = searchParams.instance || '';
  const direction = searchParams.direction || 'all';
  const page = parseInt(searchParams.page || '1');
  const pageSize = 50;

  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  const endpoint = `${baseUrl}/api/admin/messages?q=${query}&phone=${phone}&instance=${instance}&direction=${direction}&page=${page}&limit=${pageSize}`;
  
  let messages: any[] = [];
  let count = 0;
  let clients: any[] = [];
  let error: string | null = null;
  let hint: string | undefined = undefined;

  try {
    // Fetch messages
    const msgRes = await fetch(endpoint, {
      cache: 'no-store'
    });
    const msgData = await msgRes.json();
    if (!msgRes.ok) {
      throw new Error(msgData.error || 'Erro ao carregar mensagens');
    }
    messages = msgData.messages || [];
    count = msgData.count || 0;

    // Fetch clients for dropdown
    const clientRes = await fetch(`${baseUrl}/api/admin/clients`, { cache: 'no-store' });
    if (clientRes.ok) {
      clients = await clientRes.json();
    }
  } catch (err: any) {
    console.error('Error fetching messages data:', err);
    error = err.message;
    hint = 'Verifique se a tabela "messages" existe e se a chave SUPABASE_SERVICE_ROLE_KEY está configurada.';
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Mensagens</h1>
        <p className="text-slate-500 mt-1">Histórico global de interações de todos os bots.</p>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <form action="/app/messages" method="GET">
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="Pesquisar no conteúdo das mensagens..."
                className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
              {phone && <input type="hidden" name="phone" value={phone} />}
              {instance && <input type="hidden" name="instance" value={instance} />}
              {direction !== 'all' && <input type="hidden" name="direction" value={direction} />}
            </form>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <select 
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              onChange={(e) => {
                const val = e.target.value;
                window.location.href = `/app/messages?phone=${val}${query ? `&q=${query}` : ''}${direction !== 'all' ? `&direction=${direction}` : ''}`;
              }}
              value={phone}
            >
              <option value="">Todos os Clientes</option>
              {clients?.map(c => (
                <option key={c.id} value={c.phone_e164}>{c.company_name}</option>
              ))}
            </select>

            <select 
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              onChange={(e) => {
                const val = e.target.value;
                window.location.href = `/app/messages?direction=${val}${query ? `&q=${query}` : ''}${phone ? `&phone=${phone}` : ''}`;
              }}
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
              {(!messages || messages.length === 0) && (
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
        {count && count > pageSize && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <p className="text-xs text-slate-500">
              A mostrar <span className="font-bold">{(page - 1) * pageSize + 1}</span> a <span className="font-bold">{Math.min(page * pageSize, count)}</span> de <span className="font-bold">{count}</span> mensagens
            </p>
            <div className="flex gap-2">
              <Link
                href={`/app/messages?page=${page - 1}${query ? `&q=${query}` : ''}${phone ? `&phone=${phone}` : ''}${direction !== 'all' ? `&direction=${direction}` : ''}`}
                className={`p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition ${page === 1 ? 'pointer-events-none opacity-50' : ''}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <Link
                href={`/app/messages?page=${page + 1}${query ? `&q=${query}` : ''}${phone ? `&phone=${phone}` : ''}${direction !== 'all' ? `&direction=${direction}` : ''}`}
                className={`p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition ${page * pageSize >= count ? 'pointer-events-none opacity-50' : ''}`}
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
      <DebugPanel endpoint={endpoint} error={error} hint={hint} data={messages} />
    </div>
  );
}
