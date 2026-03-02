'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'motion/react';
import { LogIn, Mail, Lock, AlertCircle, CheckCircle, Terminal, Trash2, Copy, ShieldCheck } from 'lucide-react';

interface LogEntry {
  ts: string;
  action: string;
  ok: boolean;
  message: string;
  details?: any;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<'password' | 'magic-link' | 'signup' | 'recover'>('password');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  const router = useRouter();
  const supabase = createClient();

  const envVarsMissing = !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  function addLog(action: string, ok: boolean, message: string, details?: any) {
    setLogs(prev => [
      { ts: new Date().toLocaleTimeString(), action, ok, message, details },
      ...prev
    ]);
  }

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const actionType = mode === 'signup' ? 'signup' : mode === 'recover' ? 'recover' : 'login';
    addLog(actionType, true, "A iniciar pedido...");

    try {
      if (mode === 'password') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        addLog("login", true, "Sucesso no login", data);
        router.push('/app');
      } else if (mode === 'magic-link') {
        const { data, error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;
        addLog("login_otp", true, "Link enviado", data);
        setMessage('Link de acesso enviado para o seu email!');
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        });
        if (error) throw error;
        addLog("signup", true, "Sucesso no registo", data);
        setMessage('Registo efetuado! Verifique o seu email.');
      } else if (mode === 'recover') {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback`,
        });
        if (error) throw error;
        addLog("recover", true, "Email de recuperação enviado", data);
        setMessage('Email de recuperação enviado!');
      }
    } catch (err: any) {
      addLog(actionType, false, err.message || 'Erro desconhecido', err);
      setError(err.message || 'Ocorreu um erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const testSupabase = async () => {
    addLog("test", true, "A testar sessão Supabase...");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      addLog("test", true, "Sessão obtida com sucesso", data);
    } catch (err: any) {
      addLog("test", false, "Erro ao testar Supabase", err);
    }
  };

  const clearLogs = () => setLogs([]);
  
  const copyLogs = () => {
    const text = logs.map(l => `[${l.ts}] ${l.action.toUpperCase()} | ${l.ok ? 'OK' : 'FAIL'} | ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    addLog("system", true, "Logs copiados para a área de transferência");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        <div className="rounded-2xl bg-white p-8 shadow-xl border border-slate-100 space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">TrataTudo</h1>
            <p className="mt-2 text-sm text-slate-600">
              Gestão de bots e Evolution API
            </p>
          </div>

          {envVarsMissing && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 border border-amber-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="font-medium">Configuração Supabase em falta (.env)</p>
            </div>
          )}

          <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
            {[
              { id: 'password', label: 'Login' },
              { id: 'magic-link', label: 'Magic' },
              { id: 'signup', label: 'Registo' },
              { id: 'recover', label: 'Recuperar' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setMode(tab.id as any); setError(null); setMessage(null); }}
                className={`flex-1 min-w-fit px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  mode === tab.id 
                    ? 'border-b-2 border-indigo-600 text-indigo-600' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form className="space-y-6" onSubmit={handleAction}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email-address" className="block text-sm font-medium text-slate-700">
                  Endereço de Email
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                    placeholder="exemplo@email.com"
                  />
                </div>
              </div>

              {(mode === 'password' || mode === 'signup') && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Palavra-passe
                  </label>
                  <div className="relative mt-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-100"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            {message && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 border border-emerald-100"
              >
                <CheckCircle className="h-4 w-4 shrink-0" />
                <p>{message}</p>
              </motion.div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={loading || envVarsMissing}
                className="group relative flex w-full justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <LogIn className="h-5 w-5 text-indigo-400 group-hover:text-indigo-300" />
                </span>
                {loading ? 'A processar...' : 
                  mode === 'password' ? 'Entrar' : 
                  mode === 'magic-link' ? 'Enviar Link' : 
                  mode === 'signup' ? 'Criar Conta' : 'Recuperar'}
              </button>

              <button
                type="button"
                onClick={testSupabase}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Testar Supabase
              </button>
            </div>
          </form>
        </div>

        {/* Logs Panel */}
        <div className="rounded-2xl bg-slate-900 p-6 shadow-xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-200">
              <Terminal className="h-4 w-4" />
              <h2 className="text-sm font-semibold uppercase tracking-wider">Painel de Logs</h2>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={copyLogs}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
                title="Copiar logs"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button 
                onClick={clearLogs}
                className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                title="Limpar logs"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <div className="h-48 overflow-y-auto rounded-lg bg-black/50 p-3 font-mono text-[11px] space-y-1 scrollbar-thin scrollbar-thumb-slate-700">
            {logs.length === 0 ? (
              <p className="text-slate-600 italic">Nenhum evento registado...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="flex gap-2 leading-relaxed border-b border-slate-800/50 pb-1">
                  <span className="text-slate-500 shrink-0">[{log.ts}]</span>
                  <span className={`font-bold shrink-0 w-16 ${log.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                    {log.action.toUpperCase()}
                  </span>
                  <span className={log.ok ? 'text-slate-300' : 'text-red-300'}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

