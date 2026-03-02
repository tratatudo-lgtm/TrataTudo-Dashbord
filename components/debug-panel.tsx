'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Copy, AlertCircle } from 'lucide-react';

interface DebugPanelProps {
  endpoint: string;
  error?: string | null;
  hint?: string;
  data?: any;
}

export function DebugPanel({ endpoint, error, hint, data }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!error && !isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 p-2 bg-slate-900 text-white rounded-full shadow-lg hover:bg-slate-800 transition z-50"
        title="Abrir Debug"
      >
        <Terminal className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50 transition-all ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="bg-slate-900 p-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Diagnóstico de Sistema</span>
        </div>
        <button onClick={() => setIsOpen(false)} className="hover:text-slate-300">
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>

      <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-800">Erro Detetado</p>
              <p className="text-xs text-rose-600 mt-1 font-mono">{error}</p>
              {hint && <p className="text-[10px] text-rose-500 mt-2 italic">Dica: {hint}</p>}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Endpoint</label>
          <code className="block p-2 bg-slate-50 border border-slate-100 rounded text-[10px] text-slate-600 break-all">
            {endpoint}
          </code>
        </div>

        {data && (
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Payload</label>
            <pre className="block p-3 bg-slate-950 text-indigo-400 rounded-xl text-[10px] font-mono overflow-x-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}

        <button 
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify({ endpoint, error, hint, data }, null, 2));
            alert('Logs copiados para a área de transferência!');
          }}
          className="w-full flex items-center justify-center gap-2 p-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 transition"
        >
          <Copy className="h-4 w-4" />
          Copiar Logs Técnicos
        </button>
      </div>
    </div>
  );
}
