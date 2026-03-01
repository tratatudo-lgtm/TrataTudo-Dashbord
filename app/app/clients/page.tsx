import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Edit2, ExternalLink } from 'lucide-react';
import { ClientActionButtons } from '@/components/clients/client-action-buttons';

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string };
}) {
  const supabase = createClient();
  const status = searchParams.status || 'all';
  const query = searchParams.q || '';

  let dbQuery = supabase.from('clients').select('*');

  if (status !== 'all') {
    dbQuery = dbQuery.eq('status', status);
  }

  if (query) {
    dbQuery = dbQuery.ilike('name', `%${query}%`);
  }

  const { data: clients, error } = await dbQuery.order('created_at', { ascending: false });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Clientes</h1>
        <ClientActionButtons />
      </div>

      <div className="mb-6 flex gap-4">
        {['all', 'trial', 'active', 'expired'].map((s) => (
          <Link
            key={s}
            href={`/app/clients?status=${s}`}
            className={`rounded-full px-4 py-1 text-sm font-medium transition ${
              status === s
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-6 py-4">Empresa</th>
              <th className="px-6 py-4">Telefone</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Expira em</th>
              <th className="px-6 py-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {clients?.map((client) => (
              <tr key={client.id} className="hover:bg-slate-50 transition">
                <td className="px-6 py-4 font-medium text-slate-900">{client.name}</td>
                <td className="px-6 py-4 font-mono">{client.phone}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    client.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                    client.status === 'trial' ? 'bg-indigo-100 text-indigo-700' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {client.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {client.trial_end ? new Date(client.trial_end).toLocaleDateString('pt-PT') : '-'}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <Link href={`/app/clients/${client.id}`} className="p-1 text-slate-400 hover:text-indigo-600 transition">
                      <Edit2 className="h-5 w-5" />
                    </Link>
                    <button className="p-1 text-slate-400 hover:text-slate-600 transition">
                      <ExternalLink className="h-5 w-5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!clients || clients.length === 0) && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
