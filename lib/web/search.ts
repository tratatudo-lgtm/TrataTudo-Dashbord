// lib/web/search.ts
export type WebSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebPolicy = {
  enabled?: boolean;
  mode?: "allowlist" | "open";
  hosts?: string[];         // allowlist
  max_results?: number;     // 1..10
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

function normHost(h: string) {
  return safeStr(h).toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
}

function hostOfUrl(u: string) {
  try {
    const url = new URL(u);
    return normHost(url.hostname);
  } catch {
    return "";
  }
}

/**
 * Permite:
 * - match exato: host === allowed
 * - subdomínios: foo.cm-valenca.pt aceita cm-valenca.pt
 */
function isHostAllowed(url: string, allowedHosts: string[]) {
  const h = hostOfUrl(url);
  if (!h) return false;

  const allow = (allowedHosts || []).map(normHost).filter(Boolean);
  if (allow.length === 0) return false;

  return allow.some((a) => h === a || h.endsWith("." + a));
}

function decodeAmp(url: string) {
  // Whoogle às vezes devolve &amp;
  return safeStr(url).replace(/&amp;/g, "&");
}

function dedupeByUrl(items: WebSource[]) {
  const seen = new Set<string>();
  const out: WebSource[] = [];
  for (const it of items) {
    const u = decodeAmp(it.url);
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ ...it, url: u });
  }
  return out;
}

// Heurística simples para disparar pesquisa só quando faz sentido
export function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;

  // perguntas “factuais / atuais / local”
  const keywords = [
    "presidente",
    "câmara",
    "camara",
    "municipal",
    "feriado",
    "feriados",
    "data",
    "quando é",
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
 *
 * Por baixo, isto chama o teu Whoogle Proxy:
 *   GET {WEB_PROXY_URL}/search?q=...&n=...
 *   Header: X-TrataTudo-Key: WEB_PROXY_KEY
 *
 * E depois aplica policy:
 *  - mode: "allowlist" => filtra por hosts
 *  - mode: "open" => sem filtro
 */
export async function searxngSearch(
  query: string,
  n = 5,
  policy?: WebPolicy
): Promise<WebSource[]> {
  const base = process.env.WEB_PROXY_URL;
  const key = process.env.WEB_PROXY_KEY;

  if (!base || !key) return [];

  const q = safeStr(query);
  if (!q) return [];

  const maxN = Math.max(1, Math.min(10, Number(n || 5)));
  const polMax = policy?.max_results ? Math.max(1, Math.min(10, Number(policy.max_results))) : maxN;
  const want = Math.min(maxN, polMax);

  const url = new URL("/search", base);
  url.searchParams.set("q", q);
  url.searchParams.set("n", String(want));

  const { controller, clear } = withTimeout(12000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-TrataTudo-Key": key,
        "User-Agent": "TrataTudoBot/1.0",
        "Accept": "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) return [];

    const data = await res.json().catch(() => null);
    if (!data?.ok || !Array.isArray(data.results)) return [];

    // Esperado do proxy:
    // { ok:true, query:"...", results:[{title,url,snippet}] }
    let out: WebSource[] = data.results
      .map((r: any) => ({
        title: safeStr(r?.title || r?.name || ""),
        url: decodeAmp(safeStr(r?.url || r?.link || "")),
        snippet: safeStr(r?.snippet || r?.description || ""),
      }))
      .filter((r: WebSource) => r.title && r.url);

    // Dedup
    out = dedupeByUrl(out);

    // Policy filter
    const enabled = !!policy?.enabled;
    const mode = policy?.mode || "allowlist";

    if (enabled && mode === "allowlist") {
      const hosts = Array.isArray(policy?.hosts) ? policy!.hosts! : [];
      out = out.filter((r) => isHostAllowed(r.url, hosts));
    }

    return out.slice(0, want);
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
    const url = decodeAmp(safeStr(r.url));
    const snip = safeStr(r.snippet);
    lines.push(`${idx}) ${title}\n${url}${snip ? `\n${snip}` : ""}`);
  });

  lines.push(
    "\n## Regras de uso das fontes (OBRIGATÓRIO)\n" +
      "- Responde com base nas fontes.\n" +
      "- Se as fontes forem contraditórias ou fracas, diz que não consegues confirmar a 100%.\n" +
      "- No fim, inclui 'Fontes:' com 1–3 links (os mais relevantes)."
  );

  return lines.join("\n\n");
}