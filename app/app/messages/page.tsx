import { createClient } from '@/lib/supabase/server';
import { Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  const supabase = createClient();
  const query = searchParams.q || '';
  const page = parseInt(searchParams.page || '1');
  const pageSize = 20;

  let dbQuery = supabase
    .from('messages')
    .select('*', { count: 'exact' });

  if (query) {
    dbQuery = dbQuery.ilike('phone', `%${query}%`);
  }

  const { data: messages, count, error } = await dbQuery
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Histórico de Mensagens</h1>
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por número..."
            className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-6 py-4">Data</th>
              <th className="px-6 py-4">Telefone</th>
              <th className="px-6 py-4">Mensagem</th>
              <th className="px-6 py-4">Direção</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {messages?.map((msg) => (
              <tr key={msg.id} className="hover:bg-slate-50 transition">
                <td className="px-6 py-4 whitespace-nowrap">
                  {new Date(msg.created_at).toLocaleString('pt-PT')}
                </td>
                <td className="px-6 py-4 font-mono">{msg.phone}</td>
                <td className="px-6 py-4 max-w-md truncate">{msg.text}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    msg.direction === 'in' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {msg.direction === 'in' ? 'Recebida' : 'Enviada'}
                  </span>
                </td>
              </tr>
            ))}
            {(!messages || messages.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                  Nenhuma mensagem encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {count && count > pageSize && (
        <div className="mt-6 flex justify-center gap-2">
          {/* Paginação simples */}
          <button className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50 disabled:opacity-50" disabled={page === 1}>
            Anterior
          </button>
          <button className="rounded-lg border border-slate-300 px-4 py-2 hover:bg-slate-50 disabled:opacity-50" disabled={page * pageSize >= count}>
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
