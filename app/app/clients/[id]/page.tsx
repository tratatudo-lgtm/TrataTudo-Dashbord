'use client';

import { useState, useEffect } from 'react';
import {
  Calendar,
  Phone,
  Building2,
  Bot,
  History,
  Save,
  Loader2,
  Zap,
  ShieldCheck,
  FileText,
  Clock,
  Sparkles,
  Send,
  Copy,
  RefreshCw,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Terminal,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { normalizeE164 } from '@/lib/phone';
import { DebugPanel } from '@/components/debug-panel';
import { ProductionInstanceModal } from '@/components/clients/production-instance-modal';

export default function ClientDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  const [client, setClient] = useState<any>(null);
  const [recentMessages, setRecentMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<'data' | 'prompt' | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; log?: any } | null>(null);
  const [error, setError] = useState<any>(null);
  const [hint, setHint] = useState<string | undefined>(undefined);
  const [isProductionModalOpen, setIsProductionModalOpen] = useState(false);

  const endpoint = `/api/admin/clients/${params.id}`;

  // 🔐 (opcional) key pública para chamar endpoints protegidos por ADMIN_API_KEY
  // Se não definires NEXT_PUBLIC_ADMIN_API_KEY no Vercel, o botão "Migrar para Produção" vai dar 401.
  const adminKey =
    (typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_ADMIN_API_KEY) || '';

  const handleSubscribe = async () => {
    if (!confirm('Deseja ativar o plano para este cliente? Isto criará uma instância dedicada.')) return;
    setSubscribing(true);
    try {
      const res = await fetch('/api/admin/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: params.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao ativar plano');
      alert(`Plano ativado! Instância: ${data.instance_name}`);
      window.location.reload();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSubscribing(false);
    }
  };

  // ✅ NOVO: Migrar para Produção (cria/ativa client-<id> + status active + grava production_instance_name)
  const handleMigrateToProduction = async () => {
    if (
      !confirm(
        'Migrar para Produção?\n\nIsto vai criar/ativar uma instância dedicada client-<id> e mudar o cliente para status ACTIVE.'
      )
    )
      return;

    setSubscribing(true);
    try {
      const res = await fetch('/api/evolution/instances/migrate-to-production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminKey ? { 'X-TrataTudo-Key': adminKey } : {}),
        },
        body: JSON.stringify({ client_id: Number(params.id) }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao migrar para produção');

      alert(`✅ Migrado para produção!\nInstância: ${data.instance_name}`);
      await fetchData(); // atualiza a página sem reload
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSubscribing(false);
    }
  };

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [productionInstanceName, setProductionInstanceName] = useState('');
  const [status, setStatus] = useState('');
  const [trialEnd, setTrialEnd] = useState('');
  const [botInstructions, setBotInstructions] = useState('');
  const [forcePTPT, setForcePTPT] = useState(false);
  const [mapsUrl, setMapsUrl] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Esta é uma mensagem de teste do TrataTudo.');

  // Pagination
  const [msgPage, setMsgPage] = useState(1);
  const pageSize = 50;

  const router = useRouter();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      const text = await res.text();
      let json: any = {};
      try {
        json = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse client detail JSON:', e, 'Raw text:', text);
        json = { ok: false, error: 'Resposta inválida do servidor (JSON malformado)' };
      }

      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Erro ao carregar cliente');
      }

      const clientData = json.data;
      if (clientData) {
        setClient(clientData);

        setCompanyName(clientData.company_name || clientData.name || '');
        setPhoneE164(clientData.phone_e164 || clientData.phone || '');

        // ✅ estas colunas já existem no supabase (instance_name / production_instance_name)
        setInstanceName(clientData.instance_name || '');
        setProductionInstanceName(clientData.production_instance_name || '');

        setStatus(clientData.status || 'trial');

        const tEnd = clientData.trial_end || clientData.trial_ends_at || clientData.trial_end_at;
        setTrialEnd(tEnd ? tEnd.split('T')[0] : '');

        const instructions = clientData.bot_instructions || clientData.system_prompt || '';
        setBotInstructions(instructions);

        setTestPhone(clientData.phone_e164 || clientData.phone || '');

        // Check if "Responde sempre em Português de Portugal." is in the prompt
        if (instructions.includes('Responde sempre em Português de Portugal.')) {
          setForcePTPT(true);
        }

        fetchMessages(clientData.phone_e164 || clientData.phone);
      }
    } catch (err: any) {
      console.error('Error fetching client details:', err);
      setError(err.message);
      setHint('Verifique se o ID do cliente é válido e se a tabela "clients" existe.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const fetchMessages = async (phone: string) => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/messages?phone=${phone}&page=${msgPage}&limit=${pageSize}`);
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (res.ok && data.ok) {
          const payload = data.data || {};
          setRecentMessages(payload.messages || []);
        }
      } catch (e) {
        console.error('Failed to parse messages JSON in client details:', e);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  useEffect(() => {
    if (client) {
      fetchMessages(client.phone_e164 || client.phone);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgPage]);

  const handleSaveData = async () => {
    setSaving(true);
    try {
      const normalizedPhone = normalizeE164(phoneE164);
      if (!normalizedPhone) {
        throw new Error('Formato de telefone inválido.');
      }

      const updates: any = {
        company_name: companyName,
        phone_e164: normalizedPhone,
        instance_name: instanceName,
        production_instance_name: productionInstanceName,
        status: status,
        trial_end: trialEnd ? new Date(trialEnd).toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      const res = await fetch(`/api/admin/clients/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Erro ao salvar dados');

      await fetchData();

      setSavedFeedback('data');
      setTimeout(() => setSavedFeedback(null), 3000);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrompt = async () => {
    setSaving(true);
    try {
      let finalPrompt = botInstructions;
      const ptSuffix = '\n\nResponde sempre em Português de Portugal.';

      if (forcePTPT && !finalPrompt.includes(ptSuffix)) {
        finalPrompt += ptSuffix;
      } else if (!forcePTPT && finalPrompt.includes(ptSuffix)) {
        finalPrompt = finalPrompt.replace(ptSuffix, '');
      }

      const res = await fetch('/api/clients/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: params.id,
          bot_instructions: finalPrompt,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) throw new Error('Erro ao salvar prompt');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao salvar prompt');

      await fetchData();

      setSavedFeedback('prompt');
      setTimeout(() => setSavedFeedback(null), 3000);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRenew3Days = async () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    setTrialEnd(d.toISOString().split('T')[0]);
    setStatus('trial');
    alert('Data de expiração alterada para daqui a 3 dias.\nClique em "Guardar Dados" para confirmar.');
  };

  const handleGeneratePrompt = async () => {
    if (!mapsUrl) return alert('Insira o link do Google Maps.');
    setGeneratingPrompt(true);

    try {
      const resolveRes = await fetch('/api/places/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: mapsUrl }),
      });

      const details = await resolveRes.json();

      if (!resolveRes.ok) {
        console.error('Resolve Logs:', details.logs);
        const lastLog = details.logs?.[details.logs.length - 1] || 'unknown_error';
        throw new Error(`${details.error || 'Erro ao resolver local'} (resolve_failed: ${lastLog})`);
      }

      const promptRes = await fetch('/api/groq/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      });

      const promptData = await promptRes.json();
      if (!promptRes.ok) throw new Error(promptData.error);

      setBotInstructions(promptData.prompt);
      alert('Prompt gerado com sucesso! Reveja e clique em "Guardar Prompt".');
    } catch (error: any) {
      alert('Erro: ' + error.message);
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone) return alert('Insira o telefone de destino.');
    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/evolution/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: instanceName,
          number: testPhone.replace('+', ''),
          text: testMessage,
        }),
      });

      const data = await res.json();
      setTestResult({
        success: res.ok,
        message: res.ok ? 'Mensagem enviada com sucesso!' : data.error || 'Erro ao enviar',
        log: data,
      });
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-500">A carregar…</div>;

  if (!client)
    return (
      <div className="p-6">
        <p className="text-slate-700">Cliente não encontrado.</p>
        <Link href="/app" className="text-indigo-600 underline">
          Voltar
        </Link>
      </div>
    );

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{companyName}</h1>
          <div className="text-xs text-slate-500 mt-1">
            {status} • {phoneE164}
          </div>
        </div>
        <button
          onClick={() => router.push('/app')}
          className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50"
        >
          Voltar
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-100">
          <h3 className="text-sm font-bold text-rose-700">Erro ao carregar dados</h3>
          <p className="text-xs text-rose-700 mt-1">{error}</p>
          {hint && <p className="text-xs text-slate-600 mt-2">Sugestão: {hint}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-8">
          {/* A) Dados do Cliente */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600" /> Dados do Cliente
              </h2>

              <div className="flex flex-wrap gap-2 justify-end">
                {status !== 'active' && (
                  <button
                    onClick={handleSubscribe}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition shadow-sm"
                    disabled={subscribing}
                  >
                    {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Ativar Plano
                  </button>
                )}

                {/* ✅ NOVO BOTÃO */}
                <button
                  onClick={handleMigrateToProduction}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition shadow-sm"
                  disabled={subscribing}
                  title="Cria/ativa instância client-<id>, muda status para active e grava production_instance_name"
                >
                  {subscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Migrar para Produção
                </button>

                {status === 'active' && !client?.production_instance_name && (
                  <button
                    onClick={() => setIsProductionModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition shadow-sm"
                  >
                    <Smartphone className="h-4 w-4" />
                    Portar / Criar Instância
                  </button>
                )}

                <button
                  onClick={handleRenew3Days}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition shadow-sm"
                >
                  <Clock className="h-4 w-4" />
                  Renovar 3 dias
                </button>

                <button
                  onClick={handleSaveData}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-slate-900 rounded-lg hover:bg-black transition shadow-sm disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedFeedback === 'data' ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {savedFeedback === 'data' ? 'Guardado' : 'Guardar Dados'}
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome da Empresa</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Telefone (E.164)</label>
                <input
                  value={phoneE164}
                  onChange={(e) => setPhoneE164(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Instância Evolution (Teste)</label>
                <input
                  value={instanceName}
                  onChange={(e) => setInstanceName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Instância Evolution (Produção)</label>
                <input
                  value={productionInstanceName}
                  onChange={(e) => setProductionInstanceName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono bg-slate-50"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="trial">Trial</option>
                  <option value="active">Ativo</option>
                  <option value="expired">Expirado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Expira em</label>
                <input
                  type="date"
                  value={trialEnd}
                  onChange={(e) => setTrialEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            </div>
          </section>

          {/* B) Prompt do Bot */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Bot className="h-5 w-5 text-indigo-600" /> Prompt do Bot
              </h2>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <input checked={forcePTPT} onChange={(e) => setForcePTPT(e.target.checked)} type="checkbox" />
                  Forçar PT-PT
                </label>

                <button
                  onClick={handleSavePrompt}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-slate-900 rounded-lg hover:bg-black transition shadow-sm disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : savedFeedback === 'prompt' ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                  {savedFeedback === 'prompt' ? 'Guardado' : 'Guardar Prompt'}
                </button>
              </div>
            </div>

            <div className="p-6 relative">
              <textarea
                value={botInstructions}
                onChange={(e) => setBotInstructions(e.target.value)}
                className="w-full h-[500px] rounded-xl border border-slate-300 p-4 font-mono text-xs leading-relaxed focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50/50"
                placeholder="Instruções detalhadas para o bot..."
              />

              <div className="absolute bottom-10 right-10 flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(botInstructions);
                    alert('Prompt copiado!');
                  }}
                  className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition text-slate-500"
                  title="Copiar Prompt"
                >
                  <Copy className="h-4 w-4" />
                </button>

                <button
                  onClick={() => {
                    if (confirm('Deseja repor o prompt para o template padrão?')) {
                      setBotInstructions('Olá! Sou o assistente virtual da ' + companyName + '.\nComo posso ajudar?');
                    }
                  }}
                  className="p-2 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition text-slate-500"
                  title="Reset para Template"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          {/* E) Mensagens do Cliente */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-indigo-600" /> Mensagens do Cliente
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setMsgPage(Math.max(1, msgPage - 1))}
                  disabled={msgPage === 1}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="flex items-center px-3 text-xs font-medium text-slate-500">Página {msgPage}</span>
                <button
                  onClick={() => setMsgPage(msgPage + 1)}
                  disabled={recentMessages.length < pageSize}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Direção</th>
                    <th className="px-6 py-3">Mensagem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {recentMessages.map((msg: any) => (
                    <tr key={msg.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 whitespace-nowrap text-slate-400">
                        {new Date(msg.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            msg.direction === 'in' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {msg.direction === 'in' ? 'Recebida' : 'Enviada'}
                        </span>
                      </td>
                      <td className="px-6 py-3 max-w-md truncate" title={msg.text}>
                        {msg.text}
                      </td>
                    </tr>
                  ))}

                  {recentMessages.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">
                        Nenhuma mensagem encontrada para este número.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="space-y-8">
          {/* C) Gerar Prompt Automático */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" /> Gerar Prompt Automático
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Insira o link do Google Maps para extrair dados do negócio e gerar um prompt otimizado.
              </p>

              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="https://maps.app.goo.gl/..."
                  value={mapsUrl}
                  onChange={(e) => setMapsUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500"
                />

                <button
                  onClick={handleGeneratePrompt}
                  disabled={generatingPrompt || !mapsUrl}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-amber-500 rounded-lg hover:bg-amber-600 transition disabled:opacity-50 shadow-sm"
                >
                  {generatingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Analisar e Gerar
                </button>
              </div>
            </div>
          </section>

          {/* D) Teste WhatsApp */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Send className="h-5 w-5 text-emerald-500" /> Teste WhatsApp
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Enviar para</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Mensagem</label>
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full h-24 rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <button
                  onClick={handleSendTest}
                  disabled={sendingTest || !testPhone}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 shadow-sm"
                >
                  {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Teste
                </button>
              </div>

              {testResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    testResult.success ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {testResult.success ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-600" />}
                    <span className={`text-xs font-bold ${testResult.success ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {testResult.message}
                    </span>
                  </div>

                  {testResult.log && (
                    <details className="mt-2">
                      <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">
                        Ver log de debug
                      </summary>
                      <pre className="mt-2 p-2 bg-slate-900 text-indigo-400 text-[9px] rounded font-mono overflow-x-auto">
                        {JSON.stringify(testResult.log, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Quick Info Card */}
          <section className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl overflow-hidden relative">
            <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-500/20 rounded-full blur-2xl"></div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-indigo-400 mb-4">Estado da Instância</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Teste:</span>
                <span className="font-mono font-bold">{instanceName || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Produção:</span>
                <span className="font-mono font-bold text-emerald-400">{productionInstanceName || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Ligação:</span>
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></div> Operacional
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <ProductionInstanceModal
        isOpen={isProductionModalOpen}
        onClose={() => setIsProductionModalOpen(false)}
        clientId={params.id}
        clientName={companyName}
        onSuccess={(name) => {
          setInstanceName(name);
          setStatus('active');
          window.location.reload();
        }}
      />
    </div>
  );
}