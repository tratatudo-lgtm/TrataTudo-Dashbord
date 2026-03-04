'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/app';

  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    router.replace(next);
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-xl font-bold text-slate-900">Entrar</h1>
        <p className="text-xs text-slate-500 mt-1">Acesso ao TrataTudo Dashboard</p>

        {err && (
          <div className="mt-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3">
            {err}
          </div>
        )}

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="text-[11px] font-bold text-slate-600">Email</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="pt.juliocosta@gmail.com"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600">Password</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-lg bg-slate-900 text-white text-sm font-bold py-2 hover:bg-slate-800 transition disabled:opacity-50"
          >
            {loading ? 'A entrar...' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/reset-password')}
            className="w-full text-xs font-bold text-slate-600 hover:text-slate-900 underline mt-1"
          >
            Esqueci-me da password
          </button>
        </form>
      </div>
    </div>
  );
}