// lib/web/search.ts
// Pesquisa web via Whoogle Proxy (VPS) com allowlist por cliente.
// IMPORTANTE: buildSourcesContext NÃO exige snippet (porque Whoogle às vezes devolve snippet vazio).

type WebSource = {
  title?: string;
  url?: string;
  snippet?: string;
  source?: string;
};

// ---------- helpers ----------
function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeHost(input: string) {
  const s = safeStr(input).toLowerCase();
  if (!s) return '';
  return s
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .trim();
}

function hostFromUrl(url: string) {
  try {
    const u = new URL(url);
    return normalizeHost(u.hostname);
  } catch {
    // fallback: tenta normalizar string “à mão”
    return normalizeHost(url);
  }
}

// ---------- config ----------
function getProxyBaseUrl() {
  // Ajusta aqui se quiseres (mas costuma vir por env)
  // Ex.: http://79.72.48.151:8888
  return (
    process.env.TRATATUDO_SEARCH_PROXY_URL ||
    process.env.SEARCH_PROXY_URL ||
    process.env.WHOOGLE_PROXY_URL ||
    'http://79.72.48.151:8888'
  );
}

function getProxyKey() {
  return (
    process.env.TRATATUDO_PROXY_KEY ||
    process.env.SEARCH_PROXY_KEY ||
    process.env.WHOOGLE_PROXY_KEY ||
    ''
  );
}

// ---------- 1) when to search ----------
export function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;

  // perguntas factuais / atualizadas / pessoas/entidades / datas
  const triggers = [
    '?',
    'quando',
    'quem',
    'qual',
    'onde',
    'horário',
    'horario',
    'telefone',
    'morada',
    'site',
    'website',
    'feriado',
    'presidente',
    'câmara',
    'camara',
    'notícia',
    'noticia',
    'atual',
    'actual',
    'hoje',
    'agora',
  ];

  // não procurar em coisas muito curtas tipo “ok”, “olá”, etc.
  if (t.length < 8) return false;

  return triggers.some((k) => t.includes(k));
}

// ---------- 2) search ----------
export async function searxngSearch(query: string, n = 8): Promise<WebSource[]> {
  const q = safeStr(query);
  if (!q) return [];

  const base = getProxyBaseUrl().replace(/\/+$/, '');
  const key = getProxyKey();

  // se não tiver key, ainda assim tenta (mas normalmente o proxy exige)
  const url = `${base}/search?q=${encodeURIComponent(q)}&n=${encodeURIComponent(String(n))}`;

  const headers: Record<string, string> = {};
  if (key) headers['X-TrataTudo-Key'] = key;

  // Timeout curto (Vercel)
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 9000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: ctrl.signal,
      cache: 'no-store',
    });

    const raw = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    if (!res.ok || !data?.ok) return [];

    const results = Array.isArray(data.results) ? data.results : [];

    return results
      .map((r: any) => ({
        title: safeStr(r?.title),
        url: safeStr(r?.url),
        snippet: safeStr(r?.snippet),
        source: safeStr(r?.source),
      }))
      .filter((r: WebSource) => !!r.url);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- 3) allowlist filter ----------
export function filterSourcesByAllowlist(sources: WebSource[], allowDomains: string[]) {
  const list = Array.isArray(allowDomains)
    ? allowDomains.map(normalizeHost).filter(Boolean)
    : [];

  if (!Array.isArray(sources)) return [];
  if (list.length === 0) return sources;

  return sources.filter((s) => {
    const url = safeStr(s?.url);
    const h = hostFromUrl(url);
    if (!h) return false;

    // aceita domínio exato ou subdomínios
    return list.some((d) => h === d || h.endsWith(`.${d}`));
  });
}

// ---------- 4) build context for LLM ----------
export function buildSourcesContext(results: WebSource[]) {
  if (!Array.isArray(results) || results.length === 0) return '';

  // NÃO exigir snippet — porque o teu proxy por vezes devolve snippet vazio.
  const lines = results
    .filter((r) => r && r.url)
    .map((r) => {
      const url = safeStr(r.url);
      const title = safeStr(r.title) || url;
      const snippet = safeStr(r.snippet);

      // mesmo sem snippet, mantém a fonte
      return `- ${title}\n  URL: ${url}${snippet ? `\n  Resumo: ${snippet}` : ''}`;
    });

  if (lines.length === 0) return '';

  return `## FONTES (WEB)\n${lines.join('\n')}\n`;
}