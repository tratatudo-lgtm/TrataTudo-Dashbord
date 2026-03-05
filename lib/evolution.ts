// lib/evolution.ts
export function getEvolutionEnv() {
  const url = (process.env.EVOLUTION_SERVER_URL || '').trim();
  const key = (process.env.EVOLUTION_API_KEY || '').trim();

  return { url, key, ok: !!url && !!key };
}

export async function evolutionSendText(params: {
  instance: string;
  to_e164: string; // "+3519..."
  text: string;
}) {
  const { url, key, ok } = getEvolutionEnv();
  if (!ok) {
    return {
      ok: false,
      status: 0,
      raw: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
    };
  }

  const endpoint = `${url.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(params.instance)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify({
        number: params.to_e164.replace(/^\+/, ''), // evolution normalmente aceita sem "+"
        text: params.text,
      }),
    });

    const raw = await res.text();

    return {
      ok: res.ok,
      status: res.status,
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