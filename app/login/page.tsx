import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type Props = {
searchParams?: { next?: string; error?: string }
}

export default function LoginPage({ searchParams }: Props) {

async function signIn(formData: FormData) {
'use server'

const email = String(formData.get('email') || '').trim()
const password = String(formData.get('password') || '').trim()

const next = searchParams?.next || '/app'

if (!email || !password) {
  redirect(`/login?next=${encodeURIComponent(next)}&error=missing`)
}

const supabase = createClient()

const { error } = await supabase.auth.signInWithPassword({
  email,
  password
})

if (error) {
  redirect(`/login?next=${encodeURIComponent(next)}&error=invalid`)
}

redirect(next)

}

const next = searchParams?.next || '/app'
const error = searchParams?.error

return (
<div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
<div className="w-full max-w-md rounded-2xl bg-white shadow p-6">

    <h1 className="text-2xl font-semibold">TrataTudo Dashboard</h1>
    <p className="text-sm text-neutral-600 mt-1">
      Inicia sessão para aceder.
    </p>

    {error === 'invalid' && (
      <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
        Email ou password inválidos.
      </div>
    )}

    {error === 'missing' && (
      <div className="mt-4 p-3 rounded-lg bg-yellow-50 text-yellow-700 text-sm">
        Preenche email e password.
      </div>
    )}

    <form action={signIn} className="mt-6 space-y-4">

      <input type="hidden" name="next" value={next} />

      <div>
        <label className="block text-sm font-medium">
          Email
        </label>

        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          placeholder="email@exemplo.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">
          Password
        </label>

        <input
          name="password"
          type="password"
          required
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-neutral-900 text-white py-2 font-medium"
      >
        Entrar
      </button>

    </form>

  </div>
</div>

)
}