// lib/evolution.ts
// Wrapper completo para Evolution API usado pelo TrataTudo

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
    } catch {}

    return {
      ok: res.ok,
      status: res.status,
      data,
      raw,
    };

  } catch (e: any) {

    return {
      ok: false,
      status: 0,
      raw: e?.message || 'fetch_failed',
    };

  }
}

/*
LISTAR INSTÂNCIAS
*/
export async function fetchEvolutionInstances() {
  return evoFetch('/instance/fetchInstances', { method: 'GET' });
}

/*
CRIAR INSTÂNCIA
*/
export async function createEvolutionInstance(params: {
  name: string;
  webhook?: string;
  webhookEnabled?: boolean;
}) {

  return evoFetch('/instance/create', {
    method: 'POST',
    body: {
      instanceName: params.name,
      webhook: params.webhook,
      webhookEnabled: params.webhookEnabled ?? true,
    },
  });

}

/*
QR CODE DA INSTÂNCIA
*/
export async function getEvolutionInstanceQR(name: string) {

  return evoFetch(`/instance/connect/${encodeURIComponent(name)}`, {
    method: 'GET',
  });

}

/*
STATUS DA INSTÂNCIA
*/
export async function getEvolutionInstanceStatus(name: string) {

  return evoFetch(`/instance/connectionState/${encodeURIComponent(name)}`, {
    method: 'GET',
  });

}

/*
DEFINIR WEBHOOK
*/
export async function setEvolutionInstanceWebhook(params: {
  name: string;
  url: string;
  enabled?: boolean;
}) {

  return evoFetch(`/webhook/set/${encodeURIComponent(params.name)}`, {
    method: 'POST',
    body: {
      url: params.url,
      enabled: params.enabled ?? true,
    },
  });

}

/*
PAIRING CODE
AGORA SUPORTA 2 ARGUMENTOS
*/
export async function getEvolutionPairingCode(
  name: string,
  phone_e164?: string
) {

  const phone = (phone_e164 || '').trim();
  const number = phone.replace(/[^\d]/g, '');

  return evoFetch(`/instance/pairingCode/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: number ? { number } : {},
  });

}

/*
ENVIAR MENSAGEM WHATSAPP
*/
export async function evolutionSendText(params: {
  instance: string;
  to_e164: string;
  text: string;
}) {

  const number = params.to_e164.replace(/^\+/, '');

  return evoFetch(`/message/sendText/${encodeURIComponent(params.instance)}`, {
    method: 'POST',
    body: {
      number,
      text: params.text,
    },
  });

}