'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const [supabaseStatus, setSupabaseStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [isTesting, setIsTesting] = useState(false);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  const checkSupabase = async () => {
    setIsTesting(true);
    try {
      const supabase = createClient();
      // Try a simple query to check connection
      const { error } = await supabase.from('clients').select('id').limit(1);
      if (error) throw error;
      setSupabaseStatus('ok');
    } catch (err) {
      console.error('Supabase connection error:', err);
      setSupabaseStatus('error');
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    checkSupabase();
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Configurações</h1>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Estado do Sistema</h2>
          <p className="text-sm text-slate-500">Verifique a ligação aos serviços externos.</p>
        </div>

        <div className="p-6 space-y-6">
          {siteUrl && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">URL do Site</p>
                <p className="text-xs text-slate-500">NEXT_PUBLIC_SITE_URL</p>
              </div>
              <code className="px-2 py-1 bg-slate-50 rounded border border-slate-200 text-xs font-mono text-slate-600">
                {siteUrl}
              </code>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Supabase</p>
              <p className="text-xs text-slate-500">Base de dados e Autenticação</p>
            </div>
            <div className="flex items-center gap-3">
              {supabaseStatus === 'loading' ? (
                <span className="flex items-center text-amber-600 text-sm font-medium">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  A verificar...
                </span>
              ) : supabaseStatus === 'ok' ? (
                <span className="flex items-center text-emerald-600 text-sm font-medium">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  OK
                </span>
              ) : (
                <span className="flex items-center text-rose-600 text-sm font-medium">
                  <XCircle className="mr-2 h-4 w-4" />
                  ERRO
                </span>
              )}
              
              <button
                onClick={checkSupabase}
                disabled={isTesting}
                className="inline-flex items-center px-3 py-1.5 border border-slate-300 shadow-sm text-xs font-medium rounded text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isTesting ? 'A testar...' : 'Testar ligação'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
