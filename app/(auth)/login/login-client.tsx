'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const next = searchParams.get('next') || '/app';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se já estiver autenticado, manda para /app
  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data?.ok && data?.user) {
          router.replace(next);
        }
      } catch {
        // ignora
      }
    }

    check();
    return () => { cancelled = true; };
  }, [router, next]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '').trim();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Falha no login.');
        setLoading(false);
        return;
      }

      router.replace(next);
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h1 className="text-2xl font-bold text-slate-900">Login</h1>
        <p className="text-slate-500 text-sm mt-1">
          Entra para aceder ao dashboard.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="teu@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2 transition disabled:opacity-60"
          >
            {loading ? 'A entrar...' : 'Entrar'}
          </button>
        </form>

        <div className="mt-4 text-xs text-slate-500 flex justify-between">
          <Link className="hover:text-indigo-600" href="/reset-password">Esqueci-me da password</Link>
          <span className="text-slate-400">TrataTudo</span>
        </div>
      </div>
    </div>
  );
}