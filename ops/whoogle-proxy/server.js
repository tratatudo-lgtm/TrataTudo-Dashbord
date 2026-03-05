// ops/whoogle-proxy/server.js
// Node 18+/20+
// Endpoints:
//   GET /health
//   GET /search?q=...&n=...&domains=dom1,dom2
//
// Env:
//   PORT=3000
//   WHOOGLE_BASE=http://whoogle:5000
//   TRATATUDO_PROXY_KEY=xxxx

const http = require("http");
const https = require("https");

const PORT = Number(process.env.PORT || 3000);
const WHOOGLE = (process.env.WHOOGLE_BASE || "http://127.0.0.1:5000").replace(/\/+$/, "");
const API_KEY = process.env.TRATATUDO_PROXY_KEY || "";

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function safeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function decodeHtml(s) {
  return safeStr(s)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(s) {
  return decodeHtml(String(s || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(href) {
  if (!href) return "";

  // Whoogle/Google wrapper: /url?q=https://...&...
  if (href.startsWith("/url?")) {
    try {
      const u = new URL(href, "http://whoogle.local");
      const q = u.searchParams.get("q") || "";
      if (q.startsWith("http://") || q.startsWith("https://")) return q;
    } catch {}
  }

  // direct absolute
  if (href.startsWith("http://") || href.startsWith("https://")) return href;

  // ignore other relative links
  return "";
}

function hostMatchesAllowlist(url, allow) {
  if (!allow || allow.length === 0) return true;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return allow.some((d) => {
      const dom = d.toLowerCase();
      return h === dom || h.endsWith("." + dom);
    });
  } catch {
    return false;
  }
}

function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https://") ? https : http;
    const req = lib.get(
      url,
      { headers: { "User-Agent": "TrataTudoBot/1.0" } },
      (r) => {
        let data = "";
        r.on("data", (chunk) => (data += chunk));
        r.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

/**
 * Extrator simples e resiliente:
 * - apanha anchors com href e tenta usar o texto (strip tags)
 * - filtra por allowlist (domains)
 */
function extractResults(html, limit, allowDomains) {
  const out = [];
  const seen = new Set();

  // tenta apanhar: <a ... href="..."> ... </a>
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const hrefRaw = m[1];
    const anchorInner = m[2];

    const url = normalizeUrl(hrefRaw);
    if (!url) continue;

    if (!hostMatchesAllowlist(url, allowDomains)) continue;

    // título: texto limpo do <a> (muitas vezes inclui <h3>)
    const title = stripTags(anchorInner) || url;

    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ title, url });
  }

  return out;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || "/", "http://localhost");

    // simples CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-TrataTudo-Key",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      });
      return res.end();
    }

    if (u.pathname === "/health") {
      return send(res, 200, { ok: true, whoogle_base: WHOOGLE });
    }

    if (u.pathname !== "/search") {
      return send(res, 404, { ok: false, error: "not_found" });
    }

    // API key
    const key = req.headers["x-tratatudo-key"];
    if (!API_KEY || key !== API_KEY) {
      return send(res, 401, { ok: false, error: "unauthorized" });
    }

    const q = safeStr(u.searchParams.get("q"));
    const n = Math.max(1, Math.min(10, Number(u.searchParams.get("n") || 5)));

    // allowlist domains: "a.com,b.pt"
    const domainsParam = safeStr(u.searchParams.get("domains"));
    const allowDomains = domainsParam
      ? domainsParam.split(",").map((x) => x.trim()).filter(Boolean)
      : [];

    if (!q) return send(res, 200, { ok: true, query: "", results: [] });

    const whoogleUrl = `${WHOOGLE}/search?q=${encodeURIComponent(q)}`;
    const html = await fetchText(whoogleUrl, 15000);

    const results = extractResults(html, n, allowDomains);

    return send(res, 200, { ok: true, query: q, results, domains: allowDomains });
  } catch (e) {
    return send(res, 500, { ok: false, error: "server_error", detail: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`[whoogle-proxy] listening on :${PORT} -> ${WHOOGLE}`);
});