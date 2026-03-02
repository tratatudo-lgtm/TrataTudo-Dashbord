'use client';

import { useState } from 'react';
import { X, MapPin, Sparkles, Loader2, ChevronDown, ChevronUp, Copy, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function GoogleMapsBotModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<'input' | 'processing' | 'preview'>('input');
  const [businessData, setBusinessData] = useState<any>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; logs?: string[]; finalUrl?: string; diagnostics?: any } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const router = useRouter();

  if (!isOpen) return null;

  const handleProcess = async () => {
    setLoading(true);
    setError(null);
    setStep('processing');
    setShowDebug(false);

    try {
      // 1. Obter detalhes do Google Places via Resolve
      const resolveRes = await fetch('/api/places/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: url }),
      });
      
      const details = await resolveRes.json();
      if (!resolveRes.ok) {
        setError({ 
          message: details.error || 'Erro ao resolver local', 
          logs: details.logs,
          finalUrl: details.finalUrl,
          diagnostics: details.diagnostics
        });
        setStep('input');
        return;
      }
      setBusinessData(details);

      // 2. Gerar Prompt via Groq
      const promptRes = await fetch('/api/groq/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });

      const promptData = await promptRes.json();
      if (!promptRes.ok) throw new Error(promptData.error);
      
      setGeneratedPrompt(promptData.prompt);
      setStep('preview');
    } catch (err: any) {
      setError({ message: err.message });
      setStep('input');
    } finally {
      setLoading(false);
    }
  };

  const copyLogs = () => {
    const logText = JSON.stringify(error, null, 2);
    navigator.clipboard.writeText(logText);
    alert('Logs copiados!');
  };

  const handleSave = async () => {
    console.log('Prompt Gerado:', generatedPrompt);
    alert('Bot gerado com sucesso! Copia o prompt e cria o cliente.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 flex items-center">
            <Sparkles className="mr-2 h-6 w-6 text-amber-500" />
            Gerador de Bot por Link
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        {step === 'input' && (
          <div className="space-y-6">
            <p className="text-slate-600">
              Cola o link do Google Maps do negócio. Vamos extrair os dados e gerar um prompt profissional em PT-PT.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700">Link do Google Maps</label>
              <div className="mt-1 flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
                    placeholder="https://maps.app.goo.gl/..."
                  />
                </div>
                <button
                  onClick={handleProcess}
                  disabled={!url || loading}
                  className="rounded-lg bg-indigo-600 px-6 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  Processar
                </button>
              </div>
            </div>

            {error && (
              <div className="space-y-4">
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-rose-800">{error.message}</p>
                    {error.diagnostics && (
                      <div className="mt-2 p-2 bg-rose-100/50 rounded border border-rose-200 text-[10px] text-rose-900">
                        <p className="font-bold">Dica: {error.diagnostics.hint}</p>
                        <p className="mt-1 opacity-70">Status: {error.diagnostics.status} | Msg: {error.diagnostics.error_message}</p>
                      </div>
                    )}
                    <p className="text-xs text-rose-600 mt-1 font-mono">resolve_failed: {error.logs?.[error.logs.length - 1] || 'unknown_error'}</p>
                    <button 
                      onClick={copyLogs}
                      className="mt-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 hover:text-rose-900"
                    >
                      <Copy className="h-3 w-3" /> Copiar logs técnicos
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button 
                    onClick={() => setShowDebug(!showDebug)}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition text-xs font-bold text-slate-600"
                  >
                    DEBUG INFO
                    {showDebug ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {showDebug && (
                    <div className="p-4 bg-slate-900 text-indigo-400 font-mono text-[10px] space-y-2 overflow-x-auto">
                      {error.finalUrl && <p className="text-emerald-400">Final URL: {error.finalUrl}</p>}
                      {error.logs?.map((log, i) => (
                        <p key={i}>{log}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
            <h3 className="text-lg font-semibold">A analisar o negócio...</h3>
            <p className="text-slate-500">Estamos a ler o Google Maps e o Website para criar o melhor bot.</p>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-6">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
              <h3 className="font-bold text-slate-900">{businessData?.name}</h3>
              <p className="text-sm text-slate-500">{businessData?.address}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Prompt Gerado (IA)</label>
              <textarea
                className="h-64 w-full rounded-xl border border-slate-300 p-4 font-mono text-sm focus:border-indigo-500 focus:ring-indigo-500"
                value={generatedPrompt}
                onChange={(e) => setGeneratedPrompt(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('input')}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tentar Outro
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700"
              >
                Usar este Prompt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
