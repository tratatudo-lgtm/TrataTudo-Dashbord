// app/login/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextPath = useMemo(() => sp.get('next') || '/app', [sp]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      // a tua API costuma devolver { ok:true } e set-cookie no header
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Email ou password inválidos.');
        setLoading(false);
        return;
      }

      // importante: força navegação para o /app (middleware vai ler cookie)
      router.replace(nextPath);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.title}>TrataTudo</div>
          <div style={styles.subtitle}>Entrar na dashboard</div>
        </div>

        <form onSubmit={onSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="o-teu-email@exemplo.com"
              autoComplete="email"
              required
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <div style={styles.error}>{error}</div> : null}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'A entrar…' : 'Entrar'}
          </button>

          <div style={styles.small}>
            Se continuares com loop, abre <code>/api/diagnostics/auth</code> e confirma se
            aparece o cookie <code>sb-...-auth-token</code>.
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 16,
    background: '#0b1220',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
    background: '#111a2e',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
    color: 'white',
  },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 700, letterSpacing: 0.2 },
  subtitle: { fontSize: 14, opacity: 0.75, marginTop: 4 },
  form: { display: 'grid', gap: 12 },
  label: { display: 'grid', gap: 6, fontSize: 13, opacity: 0.9 },
  input: {
    height: 42,
    borderRadius: 12,
    padding: '0 12px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: 'white',
    outline: 'none',
  },
  button: {
    height: 44,
    borderRadius: 12,
    border: 'none',
    background: '#3b82f6',
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer',
  },
  error: {
    borderRadius: 12,
    padding: 10,
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.35)',
    color: '#fecaca',
    fontSize: 13,
  },
  small: { fontSize: 12, opacity: 0.7, marginTop: 4, lineHeight: 1.35 },
};