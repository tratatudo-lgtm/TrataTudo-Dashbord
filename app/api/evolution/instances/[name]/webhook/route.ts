import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function getBaseUrl(req: Request) {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('host') || '';
  return `${proto}://${host}`;
}

export async function POST(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    // ✅ Admin guard (conforme o teu validateAdmin real)
    const adminCheck = await validateAdmin();
    if (!adminCheck?.isAdmin) {
      const status = (adminCheck as any)?.status || 401;
      const error = (adminCheck as any)?.error || 'Não autorizado';
      return NextResponse.json({ ok: false, error }, { status });
    }

    const instanceName = safeStr(params?.name);
    if (!instanceName) {
      return NextResponse.json(
        { ok: false, error: 'Nome da instância é obrigatório' },
        { status: 400 }
      );
    }

    const evoUrl = safeStr(process.env.EVOLUTION_SERVER_URL);
    const evoKey = safeStr(process.env.EVOLUTION_API_KEY);

    if (!evoUrl || !evoKey) {
      return NextResponse.json(
        { ok: false, error: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY' },
        { status: 500 }
      );
    }

    // ✅ Webhook do teu dashboard (o relay mete o ?s=... por fora)
    const baseUrl = getBaseUrl(req);
    const webhookUrl = `${baseUrl}/api/webhooks/evolution`;

    // Tenta formatos comuns da Evolution API (variam por versão)
    const candidates: Array<{ path: string; body: any }> = [
      // formato 1 (muito comum)
      {
        path: `/instance/${encodeURIComponent(instanceName)}/webhook`,
        body: { url: webhookUrl, enabled: true },
      },
      // formato 2
      {
        path: `/webhook/${encodeURIComponent(instanceName)}`,
        body: { url: webhookUrl, enabled: true },
      },
      // formato 3 (algumas builds)
      {
        path: `/instances/${encodeURIComponent(instanceName)}/webhook`,
        body: { url: webhookUrl, enabled: true },
      },
    ];

    let lastStatus = 0;
    let lastText = '';

    for (const c of candidates) {
      const r = await fetch(`${evoUrl}${c.path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evoKey,
        },
        body: JSON.stringify(c.body),
      });

      lastStatus = r.status;
      lastText = await r.text();

      if (r.ok) {
        // tenta parse
        let parsed: any = null;
        try { parsed = JSON.parse(lastText); } catch { parsed = null; }

        return NextResponse.json({
          ok: true,
          data: {
            instance: instanceName,
            webhookUrl,
            evolution_path: c.path,
            evolution_status: r.status,
            evolution_response: parsed ?? lastText,
          },
        });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: 'Falha ao definir webhook na Evolution API',
        instance: instanceName,
        webhookUrl,
        evolution_status: lastStatus,
        evolution_raw: lastText?.slice(0, 800) || '',
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