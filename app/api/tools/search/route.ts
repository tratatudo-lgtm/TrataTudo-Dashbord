import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function splitDomains(domainsParam: string) {
  return domainsParam
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function getProxyConfig() {
  const base = safeStr(process.env.WHOOGLE_PROXY_URL || process.env.SEARCH_PROXY_URL);
  const key = safeStr(process.env.WHOOGLE_PROXY_KEY || process.env.SEARCH_PROXY_KEY);

  return { base, key };
}

async function callProxySearch(opts: { q: string; n: number; domains: string[] }) {
  const { base, key } = getProxyConfig();

  if (!base) {
    return { ok: false, error: 'missing_WHOOGLE_PROXY_URL' as const };
  }
  if (!key) {
    return { ok: false, error: 'missing_WHOOGLE_PROXY_KEY' as const };
  }

  const url = new URL('/search', base);
  url.searchParams.set('q', opts.q);
  url.searchParams.set('n', String(Math.max(1, Math.min(10, opts.n || 5))));
  if (opts.domains.length > 0) {
    url.searchParams.set('domains', opts.domains.join(','));
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'X-TrataTudo-Key': key,
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });

  const raw = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      error: 'proxy_http_error' as const,
      status: res.status,
      raw_preview: raw?.slice(0, 300) || '',
    };
  }

  if (!data?.ok) {
    return {
      ok: false,
      error: 'proxy_error' as const,
      status: res.status,
      proxy: data,
    };
  }

  return {
    ok: true,
    query: data.query || opts.q,
    results: Array.isArray(data.results) ? data.results : [],
  };
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const q = safeStr(u.searchParams.get('q'));
    const n = Number(u.searchParams.get('n') || '5');
    const domainsParam = safeStr(u.searchParams.get('domains') || '');
    const domains = domainsParam ? splitDomains(domainsParam) : [];

    if (!q) {
      return NextResponse.json({ ok: false, error: 'q_is_required' }, { status: 400 });
    }

    const out = await callProxySearch({ q, n, domains });
    return NextResponse.json(out, { status: out.ok ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const q = safeStr(body?.q);
    const n = Number(body?.n || 5);
    const domainsParam = safeStr(body?.domains || '');
    const domains = domainsParam ? splitDomains(domainsParam) : [];

    if (!q) {
      return NextResponse.json({ ok: false, error: 'q_is_required' }, { status: 400 });
    }

    const out = await callProxySearch({ q, n, domains });
    return NextResponse.json(out, { status: out.ok ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}