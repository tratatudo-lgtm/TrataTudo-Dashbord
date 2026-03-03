"use client";

import { useEffect, useMemo, useState } from "react";

type StatusResp =
  | { ok: false; error: string }
  | {
      ok: true;
      client_id: number;
      instance_name: string;
      found: boolean;
      connectionStatus?: string | null;
      number?: string | null;
      ownerJid?: string | null;
      profileName?: string | null;
      profilePicUrl?: string | null;
      integration?: string | null;
      updatedAt?: string | null;
    };

export default function InstanceControls({ clientId }: { clientId: number }) {
  const adminKey = useMemo(() => process.env.NEXT_PUBLIC_ADMIN_API_KEY || "", []);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [qrBase64, setQrBase64] = useState<string>("");
  const [pairingCode, setPairingCode] = useState<string>("");
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  async function postJson(path: string, body: any) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 🔐 proteção: tens de pôr a key em NEXT_PUBLIC_ADMIN_API_KEY
        "X-TrataTudo-Key": adminKey,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Erro HTTP ${res.status}`);
    return data;
  }

  async function refreshStatus() {
    try {
      const data = await postJson("/api/evolution/instances/status", { client_id: clientId });
      setStatus(data);
      const cs = (data as any)?.connectionStatus;
      if (cs === "open") setAutoRefresh(false);
    } catch (e: any) {
      setMsg(e.message || "Erro ao obter status");
    }
  }

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => refreshStatus(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, clientId]);

  async function handleCreateActivate() {
    setLoading(true);
    setMsg("");
    try {
      const data = await postJson("/api/evolution/instances/create", { client_id: clientId });
      setMsg(`OK: instância ativa = ${data.instance_name}`);
      await refreshStatus();
    } catch (e: any) {
      setMsg(e.message || "Erro ao criar/ativar instância");
    } finally {
      setLoading(false);
    }
  }

  async function handleQr() {
    setLoading(true);
    setMsg("");
    setQrBase64("");
    setPairingCode("");
    try {
      const data = await postJson("/api/evolution/instances/connect", { client_id: clientId, mode: "qr" });

      // tenta encontrar base64 em vários formatos
      const b64 =
        data?.qr?.data?.base64 ||
        data?.qr?.data?.qrcode?.base64 ||
        data?.qr?.data?.data?.base64 ||
        "";

      if (!b64) setMsg("QR não veio no response. Verifica a resposta no network/log.");
      setQrBase64(b64);
      setAutoRefresh(true);
      await refreshStatus();
    } catch (e: any) {
      setMsg(e.message || "Erro ao gerar QR");
    } finally {
      setLoading(false);
    }
  }

  async function handlePairing() {
    setLoading(true);
    setMsg("");
    setQrBase64("");
    setPairingCode("");

    const number = prompt("Número para pairing (ex: +351912345678):") || "";
    if (!number.trim()) {
      setLoading(false);
      return;
    }

    try {
      const data = await postJson("/api/evolution/instances/connect", {
        client_id: clientId,
        mode: "pairing",
        number,
      });

      // se devolveu pairingCode
      if (data?.pairingCode) {
        setPairingCode(String(data.pairingCode));
        setMsg("Pairing code gerado.");
      } else {
        // fallback: pode vir qr no response quando pairing não é suportado
        const b64 =
          data?.qr?.data?.base64 ||
          data?.qr?.data?.qrcode?.base64 ||
          data?.qr?.data?.data?.base64 ||
          "";
        if (b64) {
          setMsg("Pairing não disponível nesta instância. A mostrar QR como alternativa.");
          setQrBase64(b64);
        } else {
          setMsg("Pairing não disponível e não veio QR no fallback.");
        }
      }

      setAutoRefresh(true);
      await refreshStatus();
    } catch (e: any) {
      setMsg(e.message || "Erro ao gerar pairing");
    } finally {
      setLoading(false);
    }
  }

  const connectionStatus = (status as any)?.connectionStatus ?? "—";
  const instanceName = (status as any)?.instance_name ?? "—";
  const found = (status as any)?.found;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button disabled={loading} onClick={handleCreateActivate}>
          Criar + Ativar instância (client-{clientId})
        </button>
        <button disabled={loading} onClick={handleQr}>
          Gerar QR
        </button>
        <button disabled={loading} onClick={handlePairing}>
          Gerar Pairing
        </button>
        <button disabled={loading} onClick={refreshStatus}>
          Ver estado
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          auto-refresh (5s)
        </label>
      </div>

      <div style={{ marginTop: 10, fontSize: 14 }}>
        <div><b>Instância:</b> {instanceName}</div>
        <div><b>Encontrada na Evolution:</b> {String(Boolean(found))}</div>
        <div><b>Estado:</b> {String(connectionStatus)}</div>
      </div>

      {msg ? (
        <div style={{ marginTop: 10, padding: 8, background: "#f6f6f6", borderRadius: 8 }}>
          {msg}
        </div>
      ) : null}

      {pairingCode ? (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #ccc" }}>
          <div><b>Pairing Code</b></div>
          <div style={{ fontSize: 20, letterSpacing: 2, marginTop: 6 }}>{pairingCode}</div>
        </div>
      ) : null}

      {qrBase64 ? (
        <div style={{ marginTop: 10 }}>
          <div><b>QR Code</b></div>
          <img src={qrBase64} alt="QR" style={{ width: 260, height: 260, marginTop: 8 }} />
        </div>
      ) : null}
    </div>
  );
}