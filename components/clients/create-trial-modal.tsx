'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { normalizeE164 } from '@/lib/phone';

export function CreateTrialModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [companyName, setCompanyName] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [status, setStatus] = useState('trial');
  const [trialEnd, setTrialEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedPhone = normalizeE164(phoneE164);
    if (!normalizedPhone) {
      setError('Formato de telefone inválido. Use +351..., 00351..., ou 912345678.');
      setLoading(false);
      return;
    }

    const payload = {
      company_name: companyName,
      phone_e164: normalizedPhone,
      bot_instructions: 'Olá! Como posso ajudar?',
    };

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      setError(`Erro ao criar cliente: ${data.error || 'Erro desconhecido'}`);
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
          <h2 className="text-2xl font-bold text-slate-900">Novo Cliente</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome da Empresa</label>
            <input
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="Ex: Café Central"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Telefone (E.164)</label>
              <input
                type="text"
                required
                value={phoneE164}
                onChange={(e) => setPhoneE164(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="+351..."
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Instância</label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholder="Opcional"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              >
                <option value="trial">Trial</option>
                <option value="active">Ativo</option>
                <option value="expired">Expirado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Expira em</label>
              <input
                type="date"
                value={trialEnd}
                onChange={(e) => setTrialEnd(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">{error}</p>}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'A criar...' : 'Criar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
