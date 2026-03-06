'use client';

import { useMemo, useState } from 'react';

type Props = {
  clientId: number;
  initialEnabled?: boolean;
  initialHostsCsv?: string | null;
  initialProductionInstanceName?: string | null;
};

function normalizeCsv(csv: string) {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

export default function ClientWebAndInstanceSettings({
  clientId,
  initialEnabled = false,
  initialHostsCsv = '',
  initialProductionInstanceName = null,
}: Props) {
  const [enabled, setEnabled] = useState(Boolean(initialEnabled));
  const [hostsCsv, setHostsCsv] = useState(initialHostsCsv || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const normalizedPreview = useMemo(() => normalizeCsv(hostsCsv), [hostsCsv]);

  async function saveAllowlist() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/web-allowlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          enabled,
          hosts_csv: normalizedPreview,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao guardar');
      setMsg('Guardado ✅');
    } catch (e: any) {
      setMsg(`Erro: ${e?.message || 'falhou'}`);
    } finally {
      setBusy(false);
    }
  }

  async function clearAllowlist() {
    setEnabled(false);
    setHostsCsv('');
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/web-allowlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          enabled: false,
          hosts: [],
        }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao limpar');
      setMsg('Limpo ✅');
    } catch (e: any) {
      setMsg(`Erro: ${e?.message || 'falhou'}`);
    } finally {
      setBusy(false);
    }
  }

  async function createInstance() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/evolution/instances/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao criar instância');
      setMsg(`Instância criada ✅ (${j?.data?.instance_name || 'ok'})`);
    } catch (e: any) {
      setMsg(`Erro: ${e?.message || 'falhou'}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteInstance() {
    const instance = prompt(
      `Confirma o nome da instância a eliminar.\n\nEx: client-${clientId}\n\nATENÇÃO: isto apaga mesmo no Evolution.`,
      initialProductionInstanceName || `client-${clientId}`
    );
    if (!instance) return;

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/evolution/instances/delete', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, instance_name: instance }),
      });
      const j = await res.json();
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Falha ao eliminar instância');
      setMsg(`Instância eliminada ✅ (${instance})`);
    } catch (e: any) {
      setMsg(`Erro: ${e?.message || 'falhou'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 space-y-4">
      <div>
        <div className="text-lg font-semibold">Pesquisa Web</div>
        <div className="text-sm text-neutral-600">
          Se não definires domínios, o bot pode pesquisar, mas tenta usar fontes oficiais/autoridade.
        </div>
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={busy}
        />
        <span className="text-sm">Ativar pesquisa web (allowlist opcional)</span>
      </label>

      <div className="space-y-2">
        <div className="text-sm font-medium">Domínios permitidos (vírgulas)</div>
        <input
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="Ex: cm-valenca.pt, jf-vcca.pt"
          value={hostsCsv}
          onChange={(e) => setHostsCsv(e.target.value)}
          disabled={busy}
        />
        <div className="text-xs text-neutral-500">
          Preview: <span className="font-mono">{normalizedPreview || '(vazio)'}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={saveAllowlist}
          disabled={busy}
          className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          onClick={clearAllowlist}
          disabled={busy}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          Limpar
        </button>
      </div>

      <hr />

      <div>
        <div className="text-lg font-semibold">Instâncias Evolution</div>
        <div className="text-sm text-neutral-600">
          Criar e eliminar instâncias dedicadas (ex: <span className="font-mono">client-{clientId}</span>).
        </div>
        {initialProductionInstanceName ? (
          <div className="text-xs text-neutral-500 mt-1">
            production_instance_name atual: <span className="font-mono">{initialProductionInstanceName}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={createInstance}
          disabled={busy}
          className="rounded-lg bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Criar instância
        </button>
        <button
          onClick={deleteInstance}
          disabled={busy}
          className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
        >
          Eliminar instância
        </button>
      </div>

      {msg ? <div className="text-sm">{msg}</div> : null}
    </div>
  );
}