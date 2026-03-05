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

// Heurística simples para disparar pesquisa só quando faz sentido
export function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;

  // perguntas “factuais / atuais / local”
  const keywords = [
    "presidente",
    "câmara",
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
    "que horas são",
    "agora",
    "atual",
    "atualmente",
  ];

  const hasKeyword = keywords.some((k) => t.includes(k));
  if (hasKeyword) return true;

  // perguntas com forte probabilidade de exigir fontes
  const looksLikeQuestion =
    t.includes("?") ||
    t.startsWith("quem ") ||
    t.startsWith("qual ") ||
    t.startsWith("quais ") ||
    t.startsWith("quando ") ||
    t.startsWith("onde ") ||
    t.startsWith("como ");

  // locais que vocês usam muito no bot
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
 *   GET {WEB_PROXY_URL}/search?q=...&n=...
 *   Header: X-TrataTudo-Key: WEB_PROXY_KEY
 */
export async function searxngSearch(query: string, n = 5): Promise<WebSource[]> {
  const base = process.env.WEB_PROXY_URL;
  const key = process.env.WEB_PROXY_KEY;

  if (!base || !key) return [];

  const q = safeStr(query);
  if (!q) return [];

  const url = new URL("/search", base);
  url.searchParams.set("q", q);
  url.searchParams.set("n", String(Math.max(1, Math.min(10, n))));

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