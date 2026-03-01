'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'password' | 'magic-link' | 'forgot-password'>('password');
  const router = useRouter();
  const supabase = createClient();

  const getRedirectUrl = () => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    return `${siteUrl}/auth/callback`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else {
        router.push('/app');
      }
    } else if (mode === 'magic-link') {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: getRedirectUrl(),
        },
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage('Link de acesso enviado para o seu email!');
      }
      setLoading(false);
    } else if (mode === 'forgot-password') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRedirectUrl(),
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage('Instruções de recuperação enviadas para o seu email!');
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">TrataTudo</h1>
          <p className="text-slate-500">Dashboard de Administração</p>
        </div>

        <div className="mb-6 flex justify-center space-x-4 border-b border-slate-200 pb-4">
          <button
            onClick={() => { setMode('password'); setError(null); setMessage(null); }}
            className={`text-sm font-medium ${mode === 'password' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}
          >
            Password
          </button>
          <button
            onClick={() => { setMode('magic-link'); setError(null); setMessage(null); }}
            className={`text-sm font-medium ${mode === 'magic-link' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500'}`}
          >
            Magic Link
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>

          {mode === 'password' && (
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">Palavra-passe</label>
                <button
                  type="button"
                  onClick={() => setMode('forgot-password')}
                  className="text-xs text-indigo-600 hover:text-indigo-500"
                >
                  Esqueceu-se?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'A processar...' : (
              mode === 'password' ? 'Entrar' : 
              mode === 'magic-link' ? 'Enviar Link' : 'Recuperar Password'
            )}
          </button>

          {mode === 'forgot-password' && (
            <button
              type="button"
              onClick={() => setMode('password')}
              className="w-full text-sm text-slate-500 hover:text-slate-700"
            >
              Voltar ao login
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
