export type EvoResult<T=any> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  raw?: any;
};

function mustEnv(name: string) {
  const v = process.env[name] || '';
  if (!v) throw new Error(`missing_${name}`);
  return v;
}

function baseUrl() {
  return mustEnv('EVOLUTION_SERVER_URL').replace(/\/+$/, '');
}

function apiKey() {
  return mustEnv('EVOLUTION_API_KEY');
}

async function evoFetch(path: string, init?: RequestInit): Promise<EvoResult> {
  const url = `${baseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      apikey: apiKey(),
      ...(init?.headers || {}),
    },
  });

  const txt = await res.text();
  let json: any = null;
  try { json = JSON.parse(txt); } catch { json = null; }

  if (!res.ok) {
    return { ok: false, status: res.status, error: json?.message || txt || 'evolution_error', raw: json ?? txt };
  }

  return { ok: true, status: res.status, data: json ?? txt, raw: json ?? txt };
}

/**
 * Cria uma instância
 * Endpoint Evolution pode variar; este formato é compatível com configs comuns.
 */
export async function createEvolutionInstance(instanceName: string): Promise<EvoResult> {
  return evoFetch(`/instance/create`, {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      token: instanceName, // alguns setups exigem token; usamos instanceName
    }),
  });
}

/**
 * Configura webhook da instância para o teu RELAY
 */
export async function setEvolutionInstanceWebhook(instanceName: string): Promise<EvoResult> {
  const webhookUrl = mustEnv('EVOLUTION_WEBHOOK_URL');
  return evoFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      url: webhookUrl,
      enabled: true,
      events: [
        'messages.upsert',
        'messages.update',
        'send.message',
        'connection.update',
      ],
    }),
  });
}

/**
 * Pede QR para conectar
 */
export async function getEvolutionInstanceQR(instanceName: string): Promise<EvoResult> {
  return evoFetch(`/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  });
}

/**
 * Pairing code (se o teu Evolution suportar)
 * Algumas versões usam /instance/pairingCode/:name e apenas 1 argumento.
 */
export async function getEvolutionPairingCode(instanceName: string): Promise<EvoResult> {
  return evoFetch(`/instance/pairingCode/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  });
}

/**
 * Status da instância
 */
export async function getEvolutionInstanceStatus(instanceName: string): Promise<EvoResult> {
  return evoFetch(`/instance/status/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  });
}

/**
 * Lista instâncias
 */
export async function fetchEvolutionInstances(): Promise<EvoResult> {
  return evoFetch(`/instance/fetchInstances`, {
    method: 'GET',
  });
}