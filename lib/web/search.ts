// lib/web/search.ts
// Pesquisa web via Proxy (VPS) + ENRIQUECIMENTO de snippet (fetch ao URL quando snippet vem vazio)

type WebSource = { title?: string; url?: string; snippet?: string; source?: string };

function safeStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeHost(input: string) {
  const s = safeStr(input).toLowerCase();
  if (!s) return "";
  return s
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim();
}

function hostFromUrl(url: string) {
  try {
    const u = new URL(url);
    return normalizeHost(u.hostname);
  } catch {
    return normalizeHost(url);
  }
}

function stripDiacritics(s: string) {
  try {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    return s;
  }
}

// ---------- config ----------
function getProxyBaseUrl() {
  return (
    process.env.TRATATUDO_SEARCH_PROXY_URL ||
    process.env.SEARCH_PROXY_URL ||
    process.env.WHOOGLE_PROXY_URL ||
    "http://79.72.48.151:8888"
  );
}

function getProxyKey() {
  return (
    process.env.TRATATUDO_PROXY_KEY ||
    process.env.SEARCH_PROXY_KEY ||
    process.env.WHOOGLE_PROXY_KEY ||
    ""
  );
}

// ---------- 1) when to search ----------
export function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;

  const triggers = [
    "?",
    "quando",
    "quem",
    "qual",
    "onde",
    "horário",
    "horario",
    "telefone",
    "morada",
    "site",
    "website",
    "feriado",
    "presidente",
    "câmara",
    "camara",
    "notícia",
    "noticia",
    "atual",
    "actual",
    "hoje",
    "agora",
  ];

  if (t.length < 8) return false;
  return triggers.some((k) => t.includes(k));
}

// ---------- internal: fetch proxy search ----------
async function fetchProxy(query: string, n: number, domains?: string[]) {
  const q = safeStr(query);
  if (!q) return [];

  const base = getProxyBaseUrl().replace(/\/+$/, "");
  const key = getProxyKey();

  const params = new URLSearchParams();
  params.set("q", q);
  params.set("n", String(n));

  const domList = Array.isArray(domains)
    ? domains.map(normalizeHost).filter(Boolean)
    : [];

  if (domList.length > 0) {
    params.set("domains", domList.join(","));
  }

  const url = `${base}/search?${params.toString()}`;

  const headers: Record<string, string> = {};
  if (key) headers["X-TrataTudo-Key"] = key;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 9000);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: ctrl.signal,
      cache: "no-store",
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

// ---------- internal: extract text from html ----------
function decodeHtmlEntities(s: string) {
  // sem libs: suficiente para meta descriptions típicas
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string) {
  // remove scripts/styles e tags
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const text = noScripts.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(text)
    .replace(/\s+/g, " ")
    .trim();
}

function pickMetaDescription(html: string) {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
  return m ? safeStr(m[1]) : "";
}

async function fetchPageSnippet(pageUrl: string) {
  const url = safeStr(pageUrl);
  if (!url) return "";

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 7000);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        // alguns sites respondem melhor com UA
        "User-Agent":
          "Mozilla/5.0 (compatible; TrataTudoBot/1.0; +https://trata-tudo-dashbord.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok) return "";

    const html = await res.text();
    const meta = pickMetaDescription(html);
    if (meta && meta.length >= 40) {
      return meta.slice(0, 320);
    }

    const text = stripTags(html);
    if (!text) return "";

    // tenta apanhar a zona com "Feriado Municipal" e data
    // (sem assumir formato: só dá ao LLM um excerto útil)
    const idx = text.toLowerCase().indexOf("feriado municipal");
    const start = Math.max(0, idx === -1 ? 0 : idx - 120);
    const snippet = text.slice(start, start + 520);

    return snippet.trim();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- 2) search (retries + enrich snippet) ----------
export async function searxngSearch(
  query: string,
  n = 8,
  domains?: string[]
): Promise<WebSource[]> {
  const q0 = safeStr(query);
  if (!q0) return [];

  const q1 = stripDiacritics(q0);

  const tries: Array<{ q: string; d?: string[] }> = [
    { q: q0, d: domains },
    { q: q1, d: domains },
    { q: q0, d: undefined },
    { q: q1, d: undefined },
  ];

  let results: WebSource[] = [];
  for (const t of tries) {
    const res = await fetchProxy(t.q, n, t.d);
    if (Array.isArray(res) && res.length > 0) {
      results = res;
      break;
    }
  }

  if (!results || results.length === 0) return [];

  // Enriquecer snippet: só para 1-2 resultados e apenas quando snippet vem vazio
  const enriched: WebSource[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const snippet = safeStr(r?.snippet);
    if (snippet) {
      enriched.push(r);
      continue;
    }

    if (i <= 1) {
      const pageSnippet = await fetchPageSnippet(safeStr(r.url));
      enriched.push({ ...r, snippet: pageSnippet || "" });
    } else {
      enriched.push(r);
    }
  }

  return enriched;
}

// ---------- 3) allowlist filter ----------
export function filterSourcesByAllowlist(
  sources: WebSource[],
  allowDomains: string[]
) {
  const list = Array.isArray(allowDomains)
    ? allowDomains.map(normalizeHost).filter(Boolean)
    : [];
  if (!Array.isArray(sources)) return [];
  if (list.length === 0) return sources;

  return sources.filter((s) => {
    const url = safeStr(s?.url);
    const h = hostFromUrl(url);
    if (!h) return false;
    return list.some((d) => h === d || h.endsWith(`.${d}`));
  });
}

// ---------- 4) build context for LLM ----------
export function buildSourcesContext(results: WebSource[]) {
  if (!Array.isArray(results) || results.length === 0) return "";

  const lines = results
    .filter((r) => r && r.url)
    .map((r) => {
      const url = safeStr(r.url);
      const title = safeStr(r.title) || url;
      const snippet = safeStr(r.snippet);
      return `- ${title}\nURL: ${url}${snippet ? `\nExcerto: ${snippet}` : ""}`;
    });

  if (lines.length === 0) return "";
  return `## FONTES (WEB)\n${lines.join("\n")}\n`;
}