// lib/web/search.ts
export type WebSource = {
  title?: string;
  url: string;
  snippet?: string;
  source?: string;
};

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function uniqByUrl(items: WebSource[]) {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const it of items || []) {
    const u = safeStr(it?.url);
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ ...it, url: u });
  }
  return out;
}

// Heurística simples: só pesquisar quando a pergunta pede factos atuais/precisos
export function shouldSearchWeb(text: string): boolean {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;

  // perguntas típicas de "facto atual"
  const triggers = [
    'quem é', 'quem foi', 'presidente', 'atual', 'hoje', 'agora',
    'quando é', 'data', 'horário', 'contacto', 'telefone', 'morada',
    'site', 'website', 'feriado', 'taxa', 'preço', 'documentos', 'requisitos',
  ];

  // se for muito curto tipo "olá" não precisa
  if (t.length < 8) return false;

  return triggers.some((k) => t.includes(k));
}

// chama o teu whoogle-proxy (no VPS) — precisa de X-TrataTudo-Key
export async function searxngSearch(
  query: string,
  n = 8,
  domains?: string[]
): Promise<WebSource[]> {
  const base = safeStr(process.env.WHOOGLE_PROXY_URL || '');
  if (!base) return [];

  const key = safeStr(process.env.WHOOGLE_PROXY_KEY || '');
  // Se não houver key, não faz sentido tentar (vai dar 401)
  if (!key) return [];

  const q = encodeURIComponent(query);
  const nn = Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 8;

  let url = `${base.replace(/\/+$/, '')}/search?q=${q}&n=${nn}`;
  if (domains && domains.length > 0) {
    const dom = domains.map((d) => safeStr(d)).filter(Boolean).join(',');
    if (dom) url += `&domains=${encodeURIComponent(dom)}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-TrataTudo-Key': key,
      'Accept': 'application/json',
    },
    // evita cache do edge
    cache: 'no-store',
  });

  if (!res.ok) return [];

  const data = await res.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  const mapped: WebSource[] = results.map((r: any) => ({
    title: safeStr(r?.title) || safeStr(r?.url),
    url: safeStr(r?.url),
    snippet: safeStr(r?.snippet),
    source: safeStr(r?.source),
  }));

  return uniqByUrl(mapped);
}

// allowlist por domínios (quando definido)
export function filterSourcesByAllowlist(
  sources: WebSource[],
  allowDomains: string[]
): WebSource[] {
  const allow = (allowDomains || [])
    .map((d) => safeStr(d).toLowerCase())
    .filter(Boolean);

  if (allow.length === 0) return sources || [];

  return (sources || []).filter((s) => {
    const u = safeStr(s?.url).toLowerCase();
    if (!u) return false;
    return allow.some((d) => u.includes(`://${d}`) || u.includes(`.${d}/`) || u.includes(`//www.${d}`));
  });
}

// monta contexto para o modelo (links + snippets curtos)
export function buildSourcesContext(sources: WebSource[]): string {
  const src = (sources || []).slice(0, 8);
  if (src.length === 0) return '';

  const lines = src.map((s, i) => {
    const title = safeStr(s.title) || safeStr(s.url);
    const url = safeStr(s.url);
    const snip = safeStr(s.snippet);
    return `Fonte ${i + 1}:\n- Título: ${title}\n- URL: ${url}\n- Excerto: ${snip}\n`;
  });

  return `## FONTES (web)\n${lines.join('\n')}`;
}