'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function CreateTrialModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validação básica de telefone E.164
    if (!phoneE164.startsWith('+')) {
      setError('O telefone deve começar com + (ex: +351912345678)');
      setLoading(false);
      return;
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 3);

    const payload: any = {
      company_name: companyName,
      phone_e164: phoneE164,
      instance_name: instanceName || companyName.toLowerCase().replace(/\s+/g, '_'),
      status: 'trial',
      trial_ends_at: trialEndsAt.toISOString(),
      system_prompt: 'Olá! Como posso ajudar?',
    };

    // Fallback for old schema if new columns fail (optional, but let's try to be smart)
    // Actually, the user said "Não inventes tabelas novas: usa as existentes".
    // I'll just try to insert with the new names.
    const { error: dbError } = await supabase.from('clients').insert(payload);

    if (dbError) {
      // If it fails because of missing columns, try the old ones as a last resort?
      // No, the user wants to see "coluna em falta" in UI, so if insert fails, it fails.
      setError(`Erro ao criar cliente: ${dbError.message}. Verifique se as colunas existem no Supabase.`);
      setLoading(false);
    } else {
      onClose();
      router.refresh();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Novo Cliente Trial</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700">Nome da Empresa</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Ex: Café Central"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Telefone (E.164)</label>
            <input
              type="text"
              required
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="+351912345678"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Nome da Instância (Opcional)</label>
            <input
              type="text"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Ex: cafe_central_bot"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'A criar...' : 'Criar Trial'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
