'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextPath = useMemo(() => {
    const n = sp.get('next');
    // evita redirect para URL externa
    if (!n || !n.startsWith('/')) return '/app';
    return n;
  }, [sp]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // CRÍTICO: para aceitar Set-Cookie no browser
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setErr(data?.error || 'Credenciais inválidas.');
        setLoading(false);
        return;
      }

      // força reload server-side para middleware ler cookie
      router.replace(nextPath);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || 'Erro ao fazer login.');
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20 }}>Entrar</h1>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Email</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
              placeholder="o-teu@email.com"
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span>Password</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              required
              style={{ padding: 10, borderRadius: 10, border: '1px solid #ddd' }}
              placeholder="••••••••"
            />
          </label>

          {err ? (
            <div style={{ color: '#b00020', fontSize: 14, padding: '6px 2px' }}>
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              border: '1px solid #ddd',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            {loading ? 'A entrar…' : 'Entrar'}
          </button>

          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
            Se estiveres em loop, abre <code>/api/diagnostics/auth</code> e confirma se aparece o cookie{" "}
            <code>sb-...-auth-token</code>.
          </div>
        </form>
      </div>
    </div>
  );
}