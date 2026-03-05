// app/login/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Props = {
  searchParams?: { next?: string };
};

export default function LoginPage({ searchParams }: Props) {
  async function signIn(formData: FormData) {
    'use server';

    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '').trim();
    const next = (searchParams?.next || '/app').toString();

    if (!email || !password) {
      redirect(`/login?next=${encodeURIComponent(next)}&error=missing`);
    }

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      redirect(`/login?next=${encodeURIComponent(next)}&error=invalid`);
    }

    // Aqui a cookie é criada SERVER-SIDE (muito mais fiável)
    redirect(next);
  }

  const next = searchParams?.next || '/app';
  const error = searchParams?.error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow p-6">
        <h1 className="text-2xl font-semibold">TrataTudo — Login</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Entra para acederes à dashboard.
        </p>

        {error === 'invalid' && (
          <div className="mt-4 rounded-lg bg-red-50 text-red-700 text-sm p-3">
            Email ou password inválidos.
          </div>
        )}
        {error === 'missing' && (
          <div className="mt-4 rounded-lg bg-amber-50 text-amber-800 text-sm p-3">
            Preenche email e password.
          </div>
        )}

        <form action={signIn} className="mt-6 space-y-3">
          <input type="hidden" name="next" value={next} />

          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              name="email"
              type="email"
              autoComplete="email"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-900"
              placeholder="teu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium">Password</label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-900"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-neutral-900 text-white py-2 font-medium active:scale-[0.99]"
          >
            Entrar
          </button>

          <div className="text-xs text-neutral-500 pt-2">
            Se voltares ao login, é porque o browser bloqueou cookies. (Samsung Internet às vezes faz isso.)
          </div>
        </form>
      </div>
    </div>
  );
}