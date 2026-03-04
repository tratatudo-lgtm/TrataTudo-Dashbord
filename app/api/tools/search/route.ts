import { NextResponse } from 'next/server';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function POST(req: Request) {
  try {
    if (!isValidApiKey(req)) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const q = safeStr(body.q || body.query);
    if (!q) return NextResponse.json({ ok: false, error: 'q é obrigatório' }, { status: 400 });

    // URL do SearxNG (Vercel precisa aceder ao IP público)
    const base = safeStr(process.env.SEARXNG_URL) || 'http://79.72.48.151:8888';
    const url = `${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(q)}&format=json`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal,
      cache: 'no-store',
    }).finally(() => clearTimeout(t));

    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}

    if (!res.ok || !data) {
      return NextResponse.json(
        { ok: false, error: 'Search falhou', status: res.status, debug: text.slice(0, 300) },
        { status: 500 }
      );
    }

    // devolve só o essencial
    const results = Array.isArray(data?.results) ? data.results.slice(0, 5).map((r: any) => ({
      title: safeStr(r?.title),
      url: safeStr(r?.url),
      content: safeStr(r?.content),
    })) : [];

    return NextResponse.json({ ok: true, data: { q, results } });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}