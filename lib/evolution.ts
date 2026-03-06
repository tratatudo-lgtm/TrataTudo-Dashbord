// lib/evolution.ts
export type EvoResult<T = any> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  raw?: any;
};

function getEnv(name: string) {
  return (process.env[name] || '').trim();
}

function getBaseUrl() {
  // Ex: http://79.72.48.151:8080
  return getEnv('EVOLUTION_SERVER_URL') || getEnv('EVO_URL') || getEnv('SERVER_URL');
}

function getApiKey() {
  return getEnv('EVOLUTION_API_KEY') || getEnv('EVO_KEY') || getEnv('AUTHENTICATION_API_KEY');
}

async function evoFetch<T>(
  path: string,
  init?: RequestInit
): Promise<EvoResult<T>> {
  const base = getBaseUrl();
  const key = getApiKey();

  if (!base || !key) {
    return {
      ok: false,
      status: 0,
      error: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
      raw: { basePresent: !!base, keyPresent: !!key },
    };
  }

  const url = `${base.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        apikey: key, // Evolution API usa header "apikey"
        'Content-Type': 'application/json',
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
        error: (json?.message || json?.error || text || `HTTP ${res.status}`)?.toString(),
        raw: json || text,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: (json ?? (text as any)) as T,
      raw: json || text,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      error: e?.message || 'fetch_failed',
      raw: String(e),
    };
  }
}

/**
 * Cria instância (Baileys) no Evolution.
 * Nota: endpoints variam por versão. Estes paths funcionam na maioria dos setups "Evolution API".
 * Se o teu Evolution usa paths diferentes, diz-me o teu Swagger/Docs e eu ajusto.
 */
export async function createEvolutionInstance(instanceName: string): Promise<EvoResult<any>> {
  const name = String(instanceName || '').trim();
  if (!name) return { ok: false, status: 400, error: 'instance_name_required' };

  // Tentativa 1 (muito comum):
  // POST /instance/create  { instanceName: "client-6", token?: "" }
  let r = await evoFetch<any>('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ instanceName: name }),
  });

  // Tentativa 2 (algumas versões):
  if (!r.ok) {
    r = await evoFetch<any>('/instances/create', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // Tentativa 3 (variação):
  if (!r.ok) {
    r = await evoFetch<any>(`/instance/create/${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  return r;
}

/**
 * Elimina instância no Evolution.
 */
export async function deleteEvolutionInstance(instanceName: string): Promise<EvoResult<any>> {
  const name = String(instanceName || '').trim();
  if (!name) return { ok: false, status: 400, error: 'instance_name_required' };

  // Tentativa 1:
  // DELETE /instance/delete/:name
  let r = await evoFetch<any>(`/instance/delete/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });

  // Tentativa 2:
  if (!r.ok) {
    r = await evoFetch<any>(`/instances/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  // Tentativa 3:
  if (!r.ok) {
    r = await evoFetch<any>('/instance/delete', {
      method: 'DELETE',
      body: JSON.stringify({ instanceName: name }),
    });
  }

  return r;
}