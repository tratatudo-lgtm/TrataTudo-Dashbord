'use client';

import { Edit2, Copy, Zap, ExternalLink, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function ClientQuickActions({ client }: { client: any }) {
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const copyPhone = () => {
    const phone = client.phone_e164 || client.phone;
    if (phone) {
      navigator.clipboard.writeText(phone);
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    }
  };

  const copyPrompt = () => {
    const prompt = client.bot_instructions || client.system_prompt;
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };

  const renewTrial = async () => {
    setRenewing(true);
    try {
      const newTrialEnd = new Date();
      newTrialEnd.setDate(newTrialEnd.getDate() + 3);
      
      const updates: any = {
        id: client.id,
        status: 'trial',
        trial_end: newTrialEnd.toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const res = await fetch('/api/clients/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao renovar');
      
      router.refresh();
    } catch (err: any) {
      alert('Erro ao renovar: ' + err.message);
    } finally {
      setRenewing(false);
    }
  };

  return (
    <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <Link 
        href={`/app/clients/${client.id}`} 
        title="Abrir Detalhes"
        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
      >
        <Edit2 className="h-4 w-4" />
      </Link>
      
      <button 
        onClick={copyPhone}
        title="Copiar Telefone"
        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
      >
        {copiedPhone ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>

      <button 
        onClick={copyPrompt}
        title="Copiar Prompt"
        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
      >
        {copiedPrompt ? <Check className="h-4 w-4 text-emerald-500" /> : <Zap className="h-4 w-4" />}
      </button>

      <button 
        onClick={renewTrial}
        disabled={renewing}
        title="Renovar 3 dias"
        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition disabled:opacity-50"
      >
        {renewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 text-amber-500" />}
      </button>
    </div>
  );
}
