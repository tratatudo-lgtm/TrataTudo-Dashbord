'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function onLogin(e: React.FormEvent) {
    e.preventDefault()
    setMsg('A autenticar...')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMsg(`Erro: ${error.message}`)
      return
    }

    setMsg('OK! A redirecionar...')
    window.location.href = '/app'
  }

  async function onMagicLink() {
    setMsg('A enviar magic link...')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setMsg(`Erro: ${error.message}`)
    else setMsg('Enviado! Verifica o email.')
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: 20 }}>
      <h1>TrataTudo</h1>
      <p>Dashboard de Administração</p>

      <form onSubmit={onLogin}>
        <label>Email</label>
        <input
          style={{ width: '100%', padding: 10, margin: '8px 0' }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
        />

        <label>Palavra-passe</label>
        <input
          style={{ width: '100%', padding: 10, margin: '8px 0' }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="password"
        />

        <button style={{ width: '100%', padding: 12, marginTop: 10 }}>
          Entrar
        </button>
      </form>

      <button
        onClick={onMagicLink}
        style={{ width: '100%', padding: 12, marginTop: 10 }}
      >
        Enviar Magic Link
      </button>

      {msg && <pre style={{ marginTop: 12 }}>{msg}</pre>}
    </div>
  )
}