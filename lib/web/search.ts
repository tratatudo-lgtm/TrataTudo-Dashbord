export type WebResult = { title: string; url: string; content: string };

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();

  // perguntas factuais que mudam no tempo / pedem confirmação
  const triggers = [
    'presidente atual',
    'quem é o presidente',
    'presidente da câmara',
    'feriado municipal',
    'feriado',
    'hoje é feriado',
    'horário',
    'aberto hoje',
    'aberto amanhã',
    'atual',
    'atualmente',
    'agora',
    '2025',
    '2026',
    'site oficial',
    'notícia',
  ];

  return triggers.some(k => t.includes(k));
}

export async function searxngSearch(query: string, limit = 5): Promise<WebResult[]> {
  const baseUrl = (process.env.SEARXNG_URL || '').replace(/\/$/, '');
  if (!baseUrl) return [];

  const url = `${baseUrl}/search?format=json&q=${encodeURIComponent(query)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      // server-side fetch: ok
    });

    if (!res.ok) return [];

    const data: any = await res.json().catch(() => null);
    const results: any[] = Array.isArray(data?.results) ? data.results : [];

    return results
      .slice(0, Math.max(1, Math.min(10, limit)))
      .map(r => ({
        title: safeStr(r?.title),
        url: safeStr(r?.url),
        content: safeStr(r?.content),
      }))
      .filter(r => r.title && r.url);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export function buildSourcesContext(results: WebResult[]) {
  if (!results.length) return '';

  const lines = results.slice(0, 5).map((r, i) => {
    const snippet = r.content ? ` — ${r.content}` : '';
    return `[${i + 1}] ${r.title}${snippet}\n${r.url}`;
  });

  return `FONTES (pesquisa web):\n${lines.join('\n\n')}`;
}