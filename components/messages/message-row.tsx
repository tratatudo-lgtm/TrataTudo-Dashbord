'use client';

import { 
  ArrowUpRight, ArrowDownLeft, ExternalLink, 
  UserPlus, Phone, MessageSquare, Copy, Check
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function MessageRow({ message, clients }: { message: any; clients: any[] }) {
  const [copied, setCopied] = useState(false);
  
  // Find client by phone
  const client = clients.find(c => c.phone_e164 === message.phone || c.phone === message.phone);

  const copyText = () => {
    navigator.clipboard.writeText(message.text || '');
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
        {client ? (
          <Link 
            href={`/app/clients/${client.id}`}
            className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold group/link"
          >
            {client.company_name}
            <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-slate-400 italic text-xs">
            Desconhecido
            <Link 
              href={`/app/clients?q=${message.phone}`}
              className="p-1 rounded bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700 transition"
              title="Criar Cliente com este número"
            >
              <UserPlus className="h-3 w-3" />
            </Link>
          </div>
        )}
        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{message.phone}</div>
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
          <p className="text-slate-700 line-clamp-2 text-xs leading-relaxed" title={message.text}>
            {message.text}
          </p>
          {message.instance_name && (
            <span className="text-[9px] text-slate-400 font-mono mt-1 block">Instância: {message.instance_name}</span>
          )}
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
