// lib/webSearch.ts
export type WebResult = {
  title: string;
  url: string;
  snippet?: string;
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(t) };
}

export async function webSearch(query: string, n = 5): Promise<WebResult[]> {
  const base = process.env.WEB_PROXY_URL;
  const key = process.env.WEB_PROXY_KEY;

  if (!base || !key) return [];

  const url = new URL("/search", base);
  url.searchParams.set("q", query);
  url.searchParams.set("n", String(n));

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

    return data.results
      .map((r: any) => ({
        title: String(r.title || ""),
        url: String(r.url || ""),
        snippet: r.snippet ? String(r.snippet) : "",
      }))
      .filter((r: WebResult) => r.title && r.url)
      .slice(0, n);
  } catch {
    return [];
  } finally {
    clear();
  }
}