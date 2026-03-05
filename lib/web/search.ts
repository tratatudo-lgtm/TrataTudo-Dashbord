export type WebSource = {
  title: string;
  url: string;
  snippet?: string;
};

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeHost(h: string) {
  return safeStr(h)
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

/**
 * Decide quando vale a pena pesquisar.
 * Mantém simples e previsível: perguntas factuais/atuais, datas, cargos, horários, feriados, contactos, etc.
 */
export function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();

  // perguntas curtas e factuais (quem/quando/onde/qual)
  const isQuestion =
    t.includes('?') ||
    t.startsWith('quem ') ||
    t.startsWith('quando ') ||
    t.startsWith('onde ') ||
    t.startsWith('qual ') ||
    t.startsWith('quais ') ||
    t.startsWith('o que ') ||
    t.startsWith('que ') ||
    t.startsWith('como ');

  if (!isQuestion) return false;

  // palavras que normalmente precisam de fonte/atualização
  const triggers = [
    'presidente',
    'câmara',
    'camara',
    'feriado',
    'horário',
    'horario',
    'contacto',
    'telefone',
    'email',
    'morada',
    'site',
    'website',
    'taxa',
    'preço',
    'preco',
    'documentos',
    'requisitos',
    'regulamento',
  ];

  return triggers.some((k) => t.includes(k));
}

/**
 * Pesquisa via whoogle-proxy (VPS).
 * Requer:
 *  - WHOOGLE_PROXY_URL (ex: http://79.72.48.151:8888)
 *  - WHOOGLE_PROXY_KEY (vai no header X-TrataTudo-Key)
 *
 * O teu endpoint é: /search?q=...&n=...&domains=...
 */
export async function searxngSearch(query: string, n = 5, domains?: string[] | string) {
  const base = safeStr(process.env.WHOOGLE_PROXY_URL);
  const key = safeStr(process.env.WHOOGLE_PROXY_KEY);

  if (!base) {
    // sem proxy configurado -> devolve vazio
    return [] as WebSource[];
  }

  const q = safeStr(query);
  if (!q) return [] as WebSource[];

  let domainsParam = '';
  if (Array.isArray(domains) && domains.length) {
    domainsParam = domains.map(normalizeHost).filter(Boolean).join(',');
  } else if (typeof domains === 'string' && domains.trim()) {
    domainsParam = domains
      .split(',')
      .map(normalizeHost)
      .filter(Boolean)
      .join(',');
  }

  const url =
    `${base.replace(/\/$/, '')}/search` +
    `?q=${encodeURIComponent(q)}` +
    `&n=${encodeURIComponent(String(n))}` +
    (domainsParam ? `&domains=${encodeURIComponent(domainsParam)}` : '');

  // timeout simples para não ficar preso
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(key ? { 'X-TrataTudo-Key': key } : {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    const raw = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }

    if (!res.ok || !json || json.ok !== true || !Array.isArray(json.results)) {
      return [] as WebSource[];
    }

    // Normaliza resultados
    const results: WebSource[] = json.results
      .map((r: any) => ({
        title: safeStr(r?.title || r?.url),
        url: safeStr(r?.url),
        snippet: safeStr(r?.snippet),
      }))
      .filter((r: WebSource) => r.url.length > 0);

    return results;
  } catch {
    return [] as WebSource[];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Constrói contexto legível para o LLM com fontes.
 */
export function buildSourcesContext(results: WebSource[]) {
  if (!Array.isArray(results) || results.length === 0) return '';

  const lines: string[] = [];
  lines.push('## FONTES (pesquisa web)');
  results.forEach((r, idx) => {
    const n = idx + 1;
    const title = safeStr(r.title) || safeStr(r.url);
    const snippet = safeStr(r.snippet);
    lines.push(`${n}) ${title}`);
    lines.push(`URL: ${r.url}`);
    if (snippet) lines.push(`Resumo: ${snippet}`);
    lines.push('');
  });

  return lines.join('\n').trim();
}