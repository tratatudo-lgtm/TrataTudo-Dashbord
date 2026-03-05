'use client';

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();

  const nextPath = useMemo(() => {
    const n = search.get("next");
    return n && n.startsWith("/") ? n : "/app";
  }, [search]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setErr(data?.error || "Credenciais inválidas");
        setLoading(false);
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Erro no login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>TrataTudo</h1>

        <form onSubmit={onSubmit} style={styles.form}>
          <input
            style={styles.input}
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            style={styles.input}
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {err && <div style={styles.error}>{err}</div>}

          <button style={styles.button} disabled={loading}>
            {loading ? "A entrar..." : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{padding:20}}>Carregar...</div>}>
      <LoginForm />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#0b1220",
  },
  card: {
    background: "#111a2e",
    padding: 24,
    borderRadius: 16,
    width: "100%",
    maxWidth: 420,
    color: "white",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginBottom: 16,
  },
  form: {
    display: "grid",
    gap: 12,
  },
  input: {
    height: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #2a334a",
    background: "#0b1220",
    color: "white",
  },
  button: {
    height: 44,
    borderRadius: 10,
    border: "none",
    background: "#2563eb",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    color: "#f87171",
    fontSize: 13,
  },
};