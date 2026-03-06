// lib/evolution.ts

export type EvoResult<T = any> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  raw?: any;
};

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function getEvolutionBaseUrl() {
  return (
    safeStr(process.env.EVOLUTION_SERVER_URL) ||
    safeStr(process.env.EVOLUTION_API_URL) ||
    safeStr(process.env.EVO_URL) ||
    safeStr(process.env.SERVER_URL)
  ).replace(/\/+$/, '');
}

function getEvolutionApiKey() {
  return (
    safeStr(process.env.EVOLUTION_API_KEY) ||
    safeStr(process.env.EVO_KEY) ||
    safeStr(process.env.AUTHENTICATION_API_KEY)
  );
}

async function evoFetch<T = any>(path: string, init?: RequestInit): Promise<EvoResult<T>> {
  const baseUrl = getEvolutionBaseUrl();
  const apiKey = getEvolutionApiKey();

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      status: 0,
      error: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
      raw: {
        baseUrlPresent: !!baseUrl,
        apiKeyPresent: !!apiKey,
      },
    };
  }

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });

    const text = await res.text();
    let json: any = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: safeStr(json?.message || json?.error || text || `HTTP ${res.status}`),
        raw: json ?? text,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: (json ?? text) as T,
      raw: json ?? text,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      error: safeStr(e?.message || 'fetch_failed'),
      raw: String(e),
    };
  }
}

function encodeName(name: string) {
  return encodeURIComponent(safeStr(name));
}

export async function createEvolutionInstance(name: string): Promise<EvoResult<any>> {
  const instanceName = safeStr(name);
  if (!instanceName) {
    return { ok: false, status: 400, error: 'instance_name_required' };
  }

  let r = await evoFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
    }),
  });

  if (!r.ok) {
    r = await evoFetch('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
      }),
    });
  }

  return r;
}

export async function deleteEvolutionInstance(name: string): Promise<EvoResult<any>> {
  const instanceName = safeStr(name);
  if (!instanceName) {
    return { ok: false, status: 400, error: 'instance_name_required' };
  }

  let r = await evoFetch(`/instance/delete/${encodeName(instanceName)}`, {
    method: 'DELETE',
  });

  if (!r.ok) {
    r = await evoFetch('/instance/delete', {
      method: 'DELETE',
      body: JSON.stringify({ instanceName }),
    });
  }

  return r;
}

export async function fetchEvolutionInstances(): Promise<EvoResult<any>> {
  let r = await evoFetch('/instance/fetchInstances', {
    method: 'GET',
  });

  if (!r.ok) {
    r = await evoFetch('/instance/fetch-instances', {
      method: 'GET',
    });
  }

  return r;
}

export async function getEvolutionInstanceStatus(name: string): Promise<EvoResult<any>> {
  const instanceName = safeStr(name);
  if (!instanceName) {
    return { ok: false, status: 400, error: 'instance_name_required' };
  }

  let r = await evoFetch(`/instance/connectionState/${encodeName(instanceName)}`, {
    method: 'GET',
  });

  if (!r.ok) {
    r = await evoFetch(`/instance/status/${encodeName(instanceName)}`, {
      method: 'GET',
    });
  }

  return r;
}

export async function getEvolutionInstanceQR(name: string): Promise<EvoResult<any>> {
  const instanceName = safeStr(name);
  if (!instanceName) {
    return { ok: false, status: 400, error: 'instance_name_required' };
  }

  return evoFetch(`/instance/connect/${encodeName(instanceName)}`, {
    method: 'GET',
  });
}

export async function getEvolutionPairingCode(name: string): Promise<EvoResult<any>> {
  const instanceName = safeStr(name);
  if (!instanceName) {
    return { ok: false, status: 400, error: 'instance_name_required' };
  }

  let r = await evoFetch(`/instance/pairingCode/${encodeName(instanceName)}`, {
    method: 'GET',
  });

  if (!r.ok) {
    r = await evoFetch(`/instance/pairingCode/${encodeName(instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  return r;
}

export async function setEvolutionInstanceWebhook(
  name: string,
  webhookUrl: string
): Promise<EvoResult<any>> {
  const instanceName = safeStr(name);
  const url = safeStr(webhookUrl);

  if (!instanceName) {
    return { ok: false, status: 400, error: 'instance_name_required' };
  }

  if (!url) {
    return { ok: false, status: 400, error: 'webhook_url_required' };
  }

  let r = await evoFetch(`/webhook/set/${encodeName(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url,
        events: ['messages.upsert', 'messages.update', 'send.message'],
      },
    }),
  });

  if (!r.ok) {
    r = await evoFetch(`/webhook/set/${encodeName(instanceName)}`, {
      method: 'POST',
      body: JSON.stringify({
        url,
        enabled: true,
        events: ['messages.upsert', 'messages.update', 'send.message'],
      }),
    });
  }

  return r;
}

export async function sendEvolutionText(
  instanceName: string,
  number: string,
  text: string
): Promise<EvoResult<any>> {
  const inst = safeStr(instanceName);
  const to = safeStr(number).replace(/[^\d]/g, '');
  const msg = safeStr(text);

  if (!inst) return { ok: false, status: 400, error: 'instance_name_required' };
  if (!to) return { ok: false, status: 400, error: 'number_required' };
  if (!msg) return { ok: false, status: 400, error: 'text_required' };

  return evoFetch(`/message/sendText/${encodeName(inst)}`, {
    method: 'POST',
    body: JSON.stringify({
      number: to,
      text: msg,
    }),
  });
}