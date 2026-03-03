'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';

export default function BillingPage() {
  const [clientId, setClientId] = useState<string>('6');
  const [days, setDays] = useState<string>('30');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const renew = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/admin/billing/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Number(clientId),
          days: Number(days),
          set_active: true,
        }),
      });

      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { ok: false, error: 'Resposta inválida do servidor', debug: text?.slice(0, 200) }; }

      if (!res.ok || !data.ok) {
        setError(data.error || 'Falha ao renovar');
      } else {
        setResult(data.data);
      }
    } catch (e: any) {
      setError(e.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/app" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-slate-900">Billing</h1>
        <p className="text-slate-500 mt-1">Renovar subscrição (Regra B: acumula dias se ainda estiver ativa).</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-600">Client ID</label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="ex: 6"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600">Dias a adicionar</label>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="30"
            />
          </div>
        </div>

        <button
          onClick={renew}
          disabled={loading}
          className="w-full rounded-xl bg-slate-900 text-white py-3 text-sm font-bold hover:bg-slate-800 disabled:opacity-60"
        >
          {loading ? (
            <span className="inline-flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              A renovar...
            </span>
          ) : (
            'Renovar'
          )}
        </button>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5" />
            <div>
              <p className="text-rose-900 font-bold text-sm">Erro</p>
              <p className="text-rose-700 text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div className="w-full">
              <p className="text-emerald-900 font-bold text-sm">Renovado ✅</p>
              <div className="mt-2 text-xs text-emerald-800 space-y-1">
                <p><b>Client:</b> {result.client_id}</p>
                <p><b>Status:</b> {result.status}</p>
                <p><b>Expira em:</b> {result.subscription_expires_at}</p>
                <p><b>Dias adicionados:</b> {result.days_added}</p>
                <p><b>Modo:</b> {result.mode}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] text-slate-500">
        Dica: se quiseres por link no menu depois, eu faço. Por agora esta página já te dá controlo total sem rebentar nada.
      </div>
    </div>
  );
}