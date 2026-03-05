// lib/evolution.ts
// Wrapper único para a Evolution API.
// Mantém compatibilidade com as rotas existentes do teu projeto + adiciona sendText.

type EvoResult<T = any> = {
  ok: boolean;
  status: number;
  data?: T;
  raw?: string;
};

function cleanUrl(u: string) {
  return (u || '').trim().replace(/\/+$/, '');
}

export function getEvolutionEnv() {
  const url =
    cleanUrl(process.env.EVOLUTION_SERVER_URL || process.env.SERVER_URL || '');
  const key =
    (process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY || '').trim();

  return { url, key, ok: !!url && !!key };
}

async function evoFetch<T = any>(
  path: string,
  opts?: { method?: string; body?: any; headers?: Record<string, string> }
): Promise<EvoResult<T>> {
  const { url, key, ok } = getEvolutionEnv();
  if (!ok) {
    return {
      ok: false,
      status: 0,
      raw: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
    };
  }

  const endpoint = `${url}${path.startsWith('/') ? '' : '/'}${path}`;

  try {
    const res = await fetch(endpoint, {
      method: opts?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        ...(opts?.headers || {}),
      },
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    });

    const raw = await res.text();
    let data: any = undefined;
    try {
      data = raw ? JSON.parse(raw) : undefined;
    } catch {
      // keep raw
    }

    return { ok: res.ok, status: res.status, data, raw };
  } catch (e: any) {
    return { ok: false, status: 0, raw: e?.message || 'fetch_failed' };
  }
}

/**
 * LISTAR INSTÂNCIAS
 * Usado por: app/api/evolution/instances/route.ts
 */
export async function fetchEvolutionInstances() {
  // endpoint comum: GET /instance/fetchInstances
  // (se a tua versão tiver outro, ajusta aqui)
  return evoFetch('/instance/fetchInstances', { method: 'GET' });
}

/**
 * CRIAR INSTÂNCIA
 * Usado por: app/api/evolution/instances/route.ts
 */
export async function createEvolutionInstance(params: {
  name: string;
  webhook?: string;
  webhookEnabled?: boolean;
}) {
  // endpoint comum: POST /instance/create
  // body típico: { instanceName, ... }
  return evoFetch('/instance/create', {
    method: 'POST',
    body: {
      instanceName: params.name,
      webhook: params.webhook,
      webhookEnabled: params.webhookEnabled ?? true,
    },
  });
}

/**
 * QR DA INSTÂNCIA
 * Usado por: app/api/evolution/instances/[name]/qr/route.ts
 */
export async function getEvolutionInstanceQR(name: string) {
  // endpoint comum: GET /instance/connect/:name
  // algumas versões: /instance/connect/<name>
  return evoFetch(`/instance/connect/${encodeURIComponent(name)}`, { method: 'GET' });
}

/**
 * STATUS DA INSTÂNCIA
 * Usado por: app/api/evolution/instances/[name]/status/route.ts
 */
export async function getEvolutionInstanceStatus(name: string) {
  // endpoint comum: GET /instance/connectionState/:name
  return evoFetch(`/instance/connectionState/${encodeURIComponent(name)}`, {
    method: 'GET',
  });
}

/**
 * DEFINIR WEBHOOK DA INSTÂNCIA
 * Usado por: app/api/evolution/instances/[name]/webhook/route.ts
 */
export async function setEvolutionInstanceWebhook(params: {
  name: string;
  url: string;
  enabled?: boolean;
}) {
  // endpoint comum: POST /webhook/set/:name
  return evoFetch(`/webhook/set/${encodeURIComponent(params.name)}`, {
    method: 'POST',
    body: {
      url: params.url,
      enabled: params.enabled ?? true,
    },
  });
}

/**
 * PAIRING CODE (se a tua UI usa "pairing" em vez de QR)
 * Usado por: app/api/evolution/instances/[name]/pairing/route.ts
 */
export async function getEvolutionPairingCode(name: string) {
  // endpoint comum em algumas versões: GET /instance/pairingCode/:name
  // se não existir, devolve ok:false com raw do servidor
  return evoFetch(`/instance/pairingCode/${encodeURIComponent(name)}`, {
    method: 'GET',
  });
}

/**
 * ENVIAR TEXTO (WhatsApp)
 * Usado pelo webhook para responder ao utilizador.
 */
export async function evolutionSendText(params: {
  instance: string;
  to_e164: string; // "+3519..."
  text: string;
}) {
  // endpoint comum: POST /message/sendText/:instance
  const number = params.to_e164.replace(/^\+/, '');
  return evoFetch(`/message/sendText/${encodeURIComponent(params.instance)}`, {
    method: 'POST',
    body: { number, text: params.text },
  });
}