'use client';

import { useState, useEffect } from 'react';
import { 
  Loader2, QrCode, CheckCircle2, XCircle, 
  RefreshCw, Smartphone, ShieldCheck, Zap,
  Key, Phone
} from 'lucide-react';

interface ProductionInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  onSuccess: (instanceName: string) => void;
}

export function ProductionInstanceModal({ 
  isOpen, 
  onClose, 
  clientId, 
  clientName,
  onSuccess 
}: ProductionInstanceModalProps) {
  const [step, setStep] = useState<'idle' | 'creating' | 'choice' | 'qr' | 'pairing' | 'connecting' | 'success' | 'error'>('idle');
  const [mode, setMode] = useState<'qr' | 'pairing' | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhone, setPairingPhone] = useState<string>('');
  const [instanceName, setInstanceName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('disconnected');
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    if (isOpen && step === 'idle') {
      createInstance();
    }
  }, [isOpen]);

  const createInstance = async () => {
    setStep('creating');
    setError(null);
    try {
      const slug = clientName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 10);
      const name = `prod-${clientId.substring(0, 4)}-${slug}`;
      setInstanceName(name);

      const createRes = await fetch('/api/evolution/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName: name }),
      });
      const createData = await createRes.json();
      if (!createRes.ok && !createData.error?.includes('already exists')) {
        throw new Error(createData.error || 'Erro ao criar instância');
      }

      setStep('choice');
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  const handleChooseQR = async () => {
    setMode('qr');
    setStep('qr');
    await fetchQR(instanceName);
  };

  const handleChoosePairing = () => {
    setMode('pairing');
    setStep('pairing');
  };

  const fetchQR = async (name: string) => {
    setLoadingAction(true);
    try {
      const qrRes = await fetch(`/api/evolution/instances/${name}/qr`);
      const qrData = await qrRes.json();
      if (!qrRes.ok) throw new Error(qrData.error || 'Erro ao obter QR Code');
      
      if (qrData.qr?.base64) {
        setQrCode(qrData.qr.base64);
      } else if (qrData.qr?.code) {
        setQrCode(qrData.qr.code);
      }
    } catch (err: any) {
      console.error('QR Fetch Error:', err);
      setError(err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const fetchPairingCode = async () => {
    if (!pairingPhone) return alert('Insira o número de telefone');
    setLoadingAction(true);
    try {
      const res = await fetch(`/api/evolution/instances/${instanceName}/pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_e164: pairingPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao obter código');
      setPairingCode(data.code);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  // Polling for status
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'qr' || step === 'pairing' || step === 'connecting') {
      interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/evolution/instances/${instanceName}/status`);
          const statusData = await statusRes.json();
          const state = statusData.status?.state || 'disconnected';
          setStatus(state);

          if (state === 'open' || state === 'connected') {
            setStep('connecting');
            clearInterval(interval);
            completeFlow();
          }
        } catch (err) {
          console.error('Status Polling Error:', err);
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [step, instanceName]);

  const completeFlow = async () => {
    try {
      await fetch(`/api/evolution/instances/${instanceName}/webhook`, { method: 'POST' });

      const updateRes = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          production_instance_name: instanceName,
          status: 'active'
        }),
      });
      if (!updateRes.ok) throw new Error('Erro ao atualizar cliente no banco');

      setStep('success');
      setTimeout(() => {
        onSuccess(instanceName);
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
      setStep('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-900">Portar para Produção</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition">
              <XCircle className="h-6 w-6 text-slate-400" />
            </button>
          </div>

          <div className="space-y-6 text-center">
            {step === 'creating' && (
              <div className="py-12 flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />
                <p className="text-slate-600 font-medium">Criando instância dedicada...</p>
              </div>
            )}

            {step === 'choice' && (
              <div className="grid grid-cols-1 gap-4 py-6">
                <button 
                  onClick={handleChooseQR}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 transition group"
                >
                  <div className="h-12 w-12 bg-indigo-100 rounded-full flex items-center justify-center group-hover:bg-indigo-600 transition">
                    <QrCode className="h-6 w-6 text-indigo-600 group-hover:text-white transition" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-slate-900">Ligar por QR Code</h3>
                    <p className="text-xs text-slate-500">Escaneie o código com o telemóvel</p>
                  </div>
                </button>

                <button 
                  onClick={handleChoosePairing}
                  className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-100 hover:border-emerald-600 hover:bg-emerald-50 transition group"
                >
                  <div className="h-12 w-12 bg-emerald-100 rounded-full flex items-center justify-center group-hover:bg-emerald-600 transition">
                    <Key className="h-6 w-6 text-emerald-600 group-hover:text-white transition" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-slate-900">Ligar por Código</h3>
                    <p className="text-xs text-slate-500">Use um código de 8 dígitos</p>
                  </div>
                </button>
              </div>
            )}

            {step === 'qr' && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center">
                  {qrCode ? (
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64 rounded-lg shadow-md" />
                  ) : (
                    <div className="w-64 h-64 flex items-center justify-center bg-white rounded-lg shadow-sm">
                      <Loader2 className="h-8 w-8 text-slate-300 animate-spin" />
                    </div>
                  )}
                  <p className="mt-4 text-sm text-slate-500">Aponte o WhatsApp para o QR Code acima</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-indigo-600 font-bold animate-pulse">
                  <Smartphone className="h-5 w-5" />
                  <span>Aguardando conexão...</span>
                </div>
                <button 
                  onClick={() => fetchQR(instanceName)}
                  disabled={loadingAction}
                  className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 mx-auto transition disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingAction ? 'animate-spin' : ''}`} /> Atualizar QR Code
                </button>
              </div>
            )}

            {step === 'pairing' && (
              <div className="space-y-6">
                {!pairingCode ? (
                  <div className="space-y-4">
                    <div className="text-left">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Número de Telemóvel</label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input 
                          type="text" 
                          placeholder="+351912345678"
                          value={pairingPhone}
                          onChange={(e) => setPairingPhone(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-emerald-500 text-sm"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={fetchPairingCode}
                      disabled={loadingAction || !pairingPhone}
                      className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {loadingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                      Gerar Código de Pareamento
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-slate-900 p-8 rounded-2xl flex flex-col items-center">
                      <p className="text-slate-400 text-xs uppercase tracking-widest mb-4">Código de Pareamento</p>
                      <div className="flex gap-2">
                        {pairingCode.split('').map((char, i) => (
                          <div key={i} className="w-8 h-12 bg-slate-800 border border-slate-700 rounded-lg flex items-center justify-center text-2xl font-bold text-emerald-400">
                            {char}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-left bg-slate-50 p-4 rounded-xl space-y-2">
                      <p className="text-xs font-bold text-slate-700">Como usar:</p>
                      <ol className="text-[11px] text-slate-600 list-decimal list-inside space-y-1">
                        <li>Abra o WhatsApp no telemóvel</li>
                        <li>Vá em Dispositivos Conectados</li>
                        <li>Clique em Conectar um Dispositivo</li>
                        <li>Clique em "Ligar com número de telefone"</li>
                        <li>Insira o código acima</li>
                      </ol>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold animate-pulse">
                      <Smartphone className="h-5 w-5" />
                      <span>Aguardando conexão...</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'connecting' && (
              <div className="py-12 flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 text-emerald-500 animate-spin" />
                <p className="text-emerald-600 font-bold">WhatsApp Conectado!</p>
                <p className="text-slate-500 text-sm">Configurando webhooks e finalizando...</p>
              </div>
            )}

            {step === 'success' && (
              <div className="py-12 flex flex-col items-center gap-4">
                <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Sucesso!</h3>
                <p className="text-slate-600">O cliente agora está em produção.</p>
              </div>
            )}

            {step === 'error' && (
              <div className="py-8 flex flex-col items-center gap-4">
                <div className="h-16 w-16 bg-rose-100 rounded-full flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-rose-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Erro no Processo</h3>
                <p className="text-rose-600 text-sm">{error}</p>
                <button 
                  onClick={createInstance}
                  className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition"
                >
                  Tentar Novamente
                </button>
              </div>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-start gap-3 bg-indigo-50 p-4 rounded-2xl">
              <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
              <p className="text-xs text-indigo-700 leading-relaxed">
                Este processo criará uma instância exclusiva para o cliente. 
                As mensagens serão processadas diretamente pelo número dele, 
                garantindo maior autonomia e estabilidade.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
