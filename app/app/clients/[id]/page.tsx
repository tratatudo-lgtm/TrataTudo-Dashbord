'use client';

import { useState, useEffect } from 'react';
import { Calendar, Phone, Building2, Bot, History, Save, Loader2, Zap, ShieldCheck, FileText, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function ClientDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const [client, setClient] = useState<any>(null);
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [status, setStatus] = useState('');
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function fetchData() {
      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('id', params.id)
        .single();

      if (clientData) {
        setClient(clientData);
        setSystemPrompt(clientData.system_prompt || '');
        setInternalNotes(clientData.internal_notes || '');
        setStatus(clientData.status || '');

        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('phone', clientData.phone)
          .order('created_at', { ascending: false })
          .limit(5);
        
        setRecentMessages(messages || []);
      }
      setLoading(false);
    }
    fetchData();
  }, [params.id, supabase]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/clients/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: params.id,
          system_prompt: systemPrompt,
          internal_notes: internalNotes,
          status: status,
        }),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      router.refresh();
      alert('Alterações salvas com sucesso!');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!confirm('Deseja ativar este plano e criar uma instância na Evolution API?')) return;
    setActivating(true);
    try {
      const res = await fetch('/api/evolution/instances/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: params.id,
          instanceName: client.name.toLowerCase().replace(/\s+/g, '_'),
          phone: client.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setStatus('active');
      alert('Plano ativado e instância criada!');
      router.refresh();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setActivating(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (!client) return <div>Cliente não encontrado.</div>;

  const lastInteraction = recentMessages && recentMessages.length > 0 
    ? new Date(recentMessages[0].created_at).toLocaleString('pt-PT')
    : 'Nenhuma interação registada';

  return (
    <div className="max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{client.name}</h1>
          <p className="text-slate-500">ID: {client.id}</p>
        </div>
        <div className="flex gap-3">
          {client.status !== 'active' && (
            <button 
              onClick={handleActivate}
              disabled={activating}
              className="flex items-center rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {activating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Zap className="mr-2 h-5 w-5" />}
              Ativar Plano
            </button>
          )}
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
            Salvar Alterações
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Coluna Principal: Configurações */}
        <div className="lg:col-span-2 space-y-8">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="mb-6 flex items-center text-xl font-semibold">
              <Bot className="mr-2 h-6 w-6 text-indigo-600" />
              System Prompt (Instruções do Bot)
            </h2>
            <textarea
              className="h-96 w-full rounded-xl border border-slate-300 p-4 font-mono text-sm focus:border-indigo-500 focus:ring-indigo-500"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
            />
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="mb-6 flex items-center text-xl font-semibold">
              <History className="mr-2 h-6 w-6 text-indigo-600" />
              Últimas Interações
            </h2>
            <div className="space-y-4">
              {recentMessages?.map((msg) => (
                <div key={msg.id} className={`rounded-lg p-4 ${msg.direction === 'in' ? 'bg-slate-50' : 'bg-emerald-50'}`}>
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>{msg.direction === 'in' ? 'Utilizador' : 'Bot'}</span>
                    <span>{new Date(msg.created_at).toLocaleString('pt-PT')}</span>
                  </div>
                  <p className="text-sm">{msg.text}</p>
                </div>
              ))}
              {(!recentMessages || recentMessages.length === 0) && (
                <p className="text-center text-slate-500">Sem histórico recente.</p>
              )}
            </div>
          </div>
        </div>

        {/* Coluna Lateral: Info do Cliente */}
        <div className="space-y-8">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="mb-6 text-lg font-semibold">Informações</h2>
            <div className="space-y-4">
              <div className="flex items-center text-sm">
                <Building2 className="mr-3 h-5 w-5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-500">Empresa</p>
                  <p className="text-slate-900">{client.name}</p>
                </div>
              </div>
              <div className="flex items-center text-sm">
                <Phone className="mr-3 h-5 w-5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-500">Telefone</p>
                  <p className="text-slate-900 font-mono">{client.phone}</p>
                </div>
              </div>
              <div className="flex items-center text-sm">
                <Calendar className="mr-3 h-5 w-5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-500">Expira em</p>
                  <p className="text-slate-900">
                    {client.trial_end ? new Date(client.trial_end).toLocaleDateString('pt-PT') : 'Vitalício'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">Status do Plano</h2>
            <select
              className="w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-indigo-500 focus:ring-indigo-500"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="trial">Trial</option>
              <option value="active">Ativo</option>
              <option value="expired">Expirado</option>
            </select>
          </div>

          {/* Nova Secção: Informações Adicionais */}
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="mb-6 text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              Informações Adicionais
            </h2>
            
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Clock className="h-3 w-3" />
                  Última Interação
                </div>
                <p className="text-sm text-slate-900 bg-slate-50 p-2 rounded border border-slate-100">
                  {lastInteraction}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <ShieldCheck className="h-3 w-3" />
                  Dados de Acesso (Evolution)
                </div>
                <div className="text-[10px] font-mono text-slate-600 bg-slate-900 p-3 rounded-lg border border-slate-800 break-all">
                  <p className="text-indigo-400 mb-1">Instance Name:</p>
                  <p className="mb-2">{client.name.toLowerCase().replace(/\s+/g, '_')}</p>
                  <p className="text-indigo-400 mb-1">API Key:</p>
                  <p className="text-slate-400">••••••••••••••••••••</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <FileText className="h-3 w-3" />
                  Notas Internas
                </div>
                <textarea
                  className="w-full h-32 rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                  placeholder="Adicione notas sobre este cliente..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

