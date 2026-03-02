'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, ShieldCheck, Database, Bot, Zap, 
  CheckCircle2, XCircle, Loader2, Play, Terminal,
  Lock, Eye, EyeOff
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const [status, setStatus] = useState({
    supabase: 'checking',
    groq: 'checking',
    evolution: 'checking'
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [runningTests, setRunningTests] = useState(false);
  
  const [envStatus, setEnvStatus] = useState<any>(null);
  
  const envVars = [
    { name: 'NEXT_PUBLIC_SUPABASE_URL', key: 'supabaseUrl' },
    { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', key: 'supabaseAnonKey' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', key: 'supabaseServiceKey', critical: true },
    { name: 'GROQ_API_KEY', key: 'groqKey' },
    { name: 'GROQ_MODEL', key: 'groqModel' },
    { name: 'GOOGLE_PLACES_API_KEY', key: 'placesKey' },
    { name: 'EVOLUTION_API_URL', key: 'evolutionUrl' },
    { name: 'EVOLUTION_API_KEY', key: 'evolutionKey' },
    { name: 'NEXT_PUBLIC_SITE_URL', key: 'siteUrl' }
  ];

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const checkConfig = async () => {
    try {
      const res = await fetch('/api/admin/config-check');
      const data = await res.json();
      setEnvStatus(data);
      if (!data.supabaseServiceKey) {
        addLog('CRÍTICO: SUPABASE_SERVICE_ROLE_KEY não encontrada. As listagens de Clientes/Mensagens não vão funcionar.');
      }
    } catch (err) {
      console.error('Error checking config:', err);
    }
  };

  const checkSupabase = async () => {
    const supabase = createClient();
    try {
      const { data, error } = await supabase.from('clients').select('count', { count: 'exact', head: true });
      if (error) throw error;
      setStatus(prev => ({ ...prev, supabase: 'ok' }));
      addLog('Supabase: Ligação estabelecida com sucesso.');
    } catch (err: any) {
      setStatus(prev => ({ ...prev, supabase: 'error' }));
      addLog(`Supabase Erro: ${err.message}`);
    }
  };

  const checkGroq = async () => {
    try {
      const res = await fetch('/api/groq/test'); // I'll need to create this
      if (res.ok) {
        setStatus(prev => ({ ...prev, groq: 'ok' }));
        addLog('Groq: API respondeu corretamente.');
      } else {
        throw new Error('Falha no teste da API');
      }
    } catch (err: any) {
      setStatus(prev => ({ ...prev, groq: 'error' }));
      addLog(`Groq Erro: ${err.message}`);
    }
  };

  const checkEvolution = async () => {
    try {
      const res = await fetch('/api/evolution/test'); // I'll need to create this
      if (res.ok) {
        setStatus(prev => ({ ...prev, evolution: 'ok' }));
        addLog('Evolution: API acessível.');
      } else {
        throw new Error('Falha no teste da API');
      }
    } catch (err: any) {
      setStatus(prev => ({ ...prev, evolution: 'error' }));
      addLog(`Evolution Erro: ${err.message}`);
    }
  };

  const runAllTests = async () => {
    setRunningTests(true);
    setLogs([]);
    addLog('Iniciando testes de sistema...');
    await Promise.all([checkConfig(), checkSupabase(), checkGroq(), checkEvolution()]);
    addLog('Testes concluídos.');
    setRunningTests(false);
  };

  useEffect(() => {
    runAllTests();
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Configurações</h1>
        <p className="text-slate-500 mt-1">Checklist operacional e estado do sistema.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatusCard 
          title="Supabase" 
          status={status.supabase} 
          icon={Database} 
          description="Base de dados e Auth"
        />
        <StatusCard 
          title="Groq AI" 
          status={status.groq} 
          icon={Bot} 
          description="Geração de Prompts"
        />
        <StatusCard 
          title="Evolution API" 
          status={status.evolution} 
          icon={Zap} 
          description="WhatsApp Gateway"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Variáveis de Ambiente */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Lock className="h-5 w-5 text-indigo-600" />
              Variáveis de Ambiente
            </h2>
          </div>
          <div className="p-6 space-y-3">
            {envVars.map(v => {
              const isConfigured = envStatus ? envStatus[v.key] : false;
              return (
                <div key={v.name} className={`flex items-center justify-between p-3 rounded-xl border ${
                  isConfigured ? 'bg-slate-50 border-slate-100' : 'bg-rose-50 border-rose-100'
                }`}>
                  <div className="flex flex-col">
                    <code className="text-[10px] font-bold text-slate-600">{v.name}</code>
                    {v.critical && !isConfigured && (
                      <span className="text-[9px] text-rose-600 font-bold uppercase mt-1">Obrigatório para Admin</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      isConfigured ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'
                    }`}>
                      {isConfigured ? 'Configurado' : 'Em falta'}
                    </span>
                    {isConfigured ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-slate-400 mt-4 italic">
              * Por segurança, os valores reais das chaves não são exibidos na interface.
            </p>
          </div>
        </section>

        {/* Logs de Teste */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="h-5 w-5 text-slate-600" />
              Logs de Diagnóstico
            </h2>
            <button 
              onClick={runAllTests}
              disabled={runningTests}
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
            >
              {runningTests ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Executar Testes
            </button>
          </div>
          <div className="p-4 bg-slate-950 flex-1 min-h-[400px] font-mono text-[10px] text-indigo-400 overflow-y-auto">
            {logs.length === 0 && <p className="text-slate-600 italic">Nenhum log disponível.</p>}
            {logs.map((log, i) => (
              <div key={i} className="mb-1 border-l border-slate-800 pl-2">
                {log}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatusCard({ title, status, icon: Icon, description }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 rounded-lg bg-slate-50 text-slate-600">
          <Icon className="h-6 w-6" />
        </div>
        {status === 'checking' && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
        {status === 'ok' && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
        {status === 'error' && <XCircle className="h-5 w-5 text-rose-500" />}
      </div>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
      <div className="mt-4 pt-4 border-t border-slate-50">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${
          status === 'ok' ? 'text-emerald-600' : 
          status === 'error' ? 'text-rose-600' : 
          'text-slate-400'
        }`}>
          {status === 'ok' ? 'Operacional' : status === 'error' ? 'Erro de Ligação' : 'A verificar...'}
        </span>
      </div>
    </div>
  );
}
