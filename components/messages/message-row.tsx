'use client';

import {
  ArrowUpRight, ArrowDownLeft, ExternalLink,
  UserPlus, MessageSquare, Copy, Check
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export function MessageRow({ message, clients }: { message: any; clients: any[] }) {
  const [copied, setCopied] = useState(false);

  const msgPhone = String(message?.phone_e164 || message?.phone || message?.number || '').trim();
  const msgInstance = String(message?.instance || message?.instance_name || '').trim();

  const client = useMemo(() => {
    if (!Array.isArray(clients)) return null;

    // 1) tenta por instância (mais fiável)
    if (msgInstance) {
      const byInstance = clients.find((c: any) => {
        const inst1 = String(c?.production_instance_name || '').trim();
        const inst2 = String(c?.instance_name || '').trim();
        return inst1 === msgInstance || inst2 === msgInstance;
      });
      if (byInstance) return byInstance;
    }

    // 2) tenta por telefone (fallback)
    if (msgPhone) {
      const byPhone = clients.find((c: any) => {
        const p = String(c?.phone_e164 || c?.phone || '').trim();
        return p && p === msgPhone;
      });
      if (byPhone) return byPhone;
    }

    return null;
  }, [clients, msgInstance, msgPhone]);

  const clientId = client?.id ?? client?.client_id ?? null;
  const clientName = client?.company_name ?? 'Desconhecido';

  const copyText = () => {
    navigator.clipboard.writeText(String(message?.text || ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <tr className="hover:bg-slate-50/50 transition-colors group">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex flex-col">
          <span className="text-slate-900 font-medium">
            {new Date(message.created_at).toLocaleDateString('pt-PT')}
          </span>
          <span className="text-[10px] text-slate-400">
            {new Date(message.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </td>

      <td className="px-6 py-4">
        {clientId ? (
          <Link
            href={`/app/clients/${clientId}`}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold group/link"
          >
            {clientName}
            <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-slate-400 italic text-xs">
            Desconhecido
            {msgPhone ? (
              <Link
                href={`/app/clients?q=${encodeURIComponent(msgPhone)}`}
                className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition"
                title="Criar Cliente com este número"
              >
                <UserPlus className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        )}

        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
          {msgPhone || '-'}
        </div>

        {msgInstance ? (
          <div className="text-[9px] text-slate-400 font-mono mt-1">
            Instância: {msgInstance}
          </div>
        ) : null}
      </td>

      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          message.direction === 'in' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {message.direction === 'in' ? (
            <><ArrowDownLeft className="h-3 w-3" /> Recebida</>
          ) : (
            <><ArrowUpRight className="h-3 w-3" /> Enviada</>
          )}
        </span>
      </td>

      <td className="px-6 py-4">
        <div className="max-w-md">
          <p className="text-slate-700 line-clamp-2 text-xs leading-relaxed" title={String(message.text || '')}>
            {String(message.text || '')}
          </p>
        </div>
      </td>

      <td className="px-6 py-4 text-right">
        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copyText}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            title="Copiar Texto"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>

          <button
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            title="Ver Detalhes"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}