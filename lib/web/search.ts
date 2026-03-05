// lib/web/search.ts
export type WebSource = {
  title: string;
  url: string;
  snippet?: string;
};

function safeStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(t) };
}

/** Normaliza lista CSV "a.com, b.pt" -> ["a.com","b.pt"] */
function parseAllowlist(csv?: string | null): string[] {
  const raw = safeStr(csv);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hostOf(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return (u.hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Mantém apenas fontes cujo hostname esteja na allowlist.
 * Regras:
 * - "cm-valenca.pt" aceita "cm-valenca.pt" e subdomínios (ex: www.cm-valenca.pt)
 * - se allowlist estiver vazia, devolve as fontes como estão
 */
export function filterSourcesByAllowlist(
  sources: WebSource[],
  allowlistCsv?: string | null
): WebSource[] {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  const allow = parseAllowlist(allowlistCsv);
  if (allow.length === 0) return sources;

  return sources.filter((s) => {
    const h = hostOf(s.url);
    if (!h) return false;
    return allow.some((d) => h === d || h.endsWith("." + d));
  });
}

// Heurística simples para disparar pesquisa só quando faz sentido
export function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;

  const keywords = [
    "presidente",
    "câmara",
    "camara",
    "municipal",
    "feriado",
    "feriados",
    "data",
    "quando é",
    "quando e",
    "horário",
    "horarios",
    "aberto",
    "fecha",
    "telefone",
    "contacto",
    "contato",
    "morada",
    "endereço",
    "endereco",
    "site oficial",
    "regulamento",
    "lei",
    "decreto",
    "taxa",
    "preço",
    "preco",
    "quanto custa",
    "agora",
    "atual",
    "atualmente",
  ];

  const hasKeyword = keywords.some((k) => t.includes(k));
  if (hasKeyword) return true;

  const looksLikeQuestion =
    t.includes("?") ||
    t.startsWith("quem ") ||
    t.startsWith("qual ") ||
    t.startsWith("quais ") ||
    t.startsWith("quando ") ||
    t.startsWith("onde ") ||
    t.startsWith("como ");

  const hasLocal =
    t.includes("valença") ||
    t.includes("valenca") ||
    t.includes("cristelo") ||
    t.includes("covo") ||
    t.includes("arão") ||
    t.includes("arao");

  return looksLikeQuestion && hasLocal;
}

/**
 * Mantemos o nome "searxngSearch" para não mudares o route.ts.
 * Por baixo, isto chama o teu Whoogle Proxy:
 *   GET {WEB_PROXY_URL}/search?q=...&n=...&domains=a.com,b.pt
 *   Header: X-TrataTudo-Key: WEB_PROXY_KEY
 */
export async function searxngSearch(
  query: string,
  n = 5,
  opts?: { domains?: string | null }
): Promise<WebSource[]> {
  const base = process.env.WEB_PROXY_URL;
  const key = process.env.WEB_PROXY_KEY;

  if (!base || !key) return [];

  const q = safeStr(query);
  if (!q) return [];

  const url = new URL("/search", base);
  url.searchParams.set("q", q);
  url.searchParams.set("n", String(Math.max(1, Math.min(10, n))));

  // allowlist de domínios: prioridade opts.domains -> ENV default
  const envDomains = process.env.WEB_PROXY_DOMAINS_DEFAULT || "";
  const domains = safeStr(opts?.domains) || safeStr(envDomains);
  if (domains) url.searchParams.set("domains", domains);

  const { controller, clear } = withTimeout(12000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-TrataTudo-Key": key,
        "User-Agent": "TrataTudoBot/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const data = await res.json().catch(() => null);
    if (!data?.ok || !Array.isArray(data.results)) return [];

    const out: WebSource[] = data.results
      .map((r: any) => ({
        title: safeStr(r?.title),
        url: safeStr(r?.url),
        snippet: safeStr(r?.snippet || r?.description || ""),
      }))
      .filter((r: WebSource) => r.title && r.url)
      .slice(0, n);

    return out;
  } catch {
    return [];
  } finally {
    clear();
  }
}

export function buildSourcesContext(results: WebSource[]) {
  if (!Array.isArray(results) || results.length === 0) return "";

  const lines: string[] = [];
  lines.push("## FONTES WEB (Whoogle Proxy)");
  results.slice(0, 5).forEach((r, i) => {
    const idx = i + 1;
    const title = safeStr(r.title);
    const url = safeStr(r.url);
    const snip = safeStr(r.snippet);
    lines.push(`${idx}) ${title}\n${url}${snip ? `\n${snip}` : ""}`);
  });

  // Este bloco é só contexto para o LLM (não é para o utilizador)
  lines.push(
    "\n## Regras de uso das fontes (OBRIGATÓRIO)\n" +
      "- Responde com base nas fontes.\n" +
      "- Se as fontes forem contraditórias ou fracas, diz que não consegues confirmar a 100%.\n" +
      "- No fim, inclui 'Fontes:' com 1–3 links (os mais relevantes)."
  );

  return lines.join("\n\n");
}