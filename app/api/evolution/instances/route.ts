import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// aceita "923..." / "+351..." / "351..." e normaliza para E.164 se der
function normalizeE164(input: string) {
  const s = safeStr(input).replace(/\s+/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s;
  // se vier PT sem + (ex: 3519...)
  if (/^351\d{9}$/.test(s)) return `+${s}`;
  // se vier só 9 dígitos PT (ex: 923...)
  if (/^\d{9}$/.test(s)) return `+351${s}`;
  return s; // deixa como está
}

async function evoFetch(path: string, method: string, body?: any) {
  const evoUrl = safeStr(process.env.EVOLUTION_SERVER_URL);
  const evoKey = safeStr(process.env.EVOLUTION_API_KEY);
  if (!evoUrl || !evoKey) {
    return {
      ok: false,
      status: 0,
      raw: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
      data: null,
    };
  }

  const r = await fetch(`${evoUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: evoKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await r.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }

  return { ok: r.ok, status: r.status, raw: text, data: parsed ?? text };
}

// GET: lista instâncias
export async function GET() {
  try {
    const adminCheck = await validateAdmin();
    if (!adminCheck?.isAdmin) {
      const status = (adminCheck as any)?.status || 401;
      const error = (adminCheck as any)?.error || 'Não autorizado';
      return NextResponse.json({ ok: false, error }, { status });
    }

    // endpoints variam — tentamos 3
    const candidates = [
      { path: `/instance/list`, label: 'instance/list' },
      { path: `/instances`, label: 'instances' },
      { path: `/instance/fetchInstances`, label: 'instance/fetchInstances' },
    ];

    let last: any = null;

    for (const c of candidates) {
      const res = await evoFetch(c.path, 'GET');
      last = { ...res, label: c.label, path: c.path };
      if (res.ok) {
        return NextResponse.json({
          ok: true,
          data: res.data,
          evolution_path: c.path,
        });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Falha ao listar instâncias na Evolution API',
        evolution_status: last?.status || 0,
        evolution_path: last?.path,
        evolution_raw: String(last?.raw || '').slice(0, 800),
      },
      { status: 502 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}

// POST: cria instância
// body: { name: string, number?: string }  (number opcional)
export async function POST(req: Request) {
  try {
    const adminCheck = await validateAdmin();
    if (!adminCheck?.isAdmin) {
      const status = (adminCheck as any)?.status || 401;
      const error = (adminCheck as any)?.error || 'Não autorizado';
      return NextResponse.json({ ok: false, error }, { status });
    }

    const body = await req.json().catch(() => ({}));
    const instanceName = safeStr(body?.name || body?.instance || body?.instance_name);
    const number = normalizeE164(body?.number || body?.phone_e164 || body?.phone || '');

    if (!instanceName) {
      return NextResponse.json(
        { ok: false, error: 'Nome da instância é obrigatório' },
        { status: 400 }
      );
    }

    // Varia por versão. Tentamos 3 formatos:
    const candidates: Array<{ path: string; payload: any; label: string }> = [
      // formato A (bem comum)
      {
        label: 'instance/create',
        path: `/instance/create`,
        payload: number
          ? { instanceName, token: instanceName, qrcode: true, number }
          : { instanceName, token: instanceName, qrcode: true },
      },
      // formato B
      {
        label: 'instances',
        path: `/instances`,
        payload: number ? { name: instanceName, number } : { name: instanceName },
      },
      // formato C
      {
        label: 'instance/add',
        path: `/instance/add`,
        payload: number ? { instanceName, number } : { instanceName },
      },
    ];

    let last: any = null;

    for (const c of candidates) {
      const res = await evoFetch(c.path, 'POST', c.payload);
      last = { ...res, label: c.label, path: c.path };
      if (res.ok) {
        return NextResponse.json({
          ok: true,
          data: res.data,
          evolution_path: c.path,
          payload_used: c.payload,
        });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Falha ao criar instância na Evolution API',
        instance: instanceName,
        number: number || null,
        evolution_status: last?.status || 0,
        evolution_path: last?.path,
        evolution_raw: String(last?.raw || '').slice(0, 800),
      },
      { status: 502 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}