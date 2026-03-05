import { NextResponse } from 'next/server';
import { getEvolutionPairingCode } from '@/lib/evolution';
import { validateAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

export async function POST(
  req: Request,
  { params }: { params: { name: string } }
) {
  try {
    // Admin guard (mantém como tens no projeto)
    const adminCheck = await validateAdmin();
    if (!adminCheck?.ok) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const phone_e164 = safeStr(body?.phone_e164 || body?.phone || body?.number);

    if (!phone_e164) {
      return NextResponse.json(
        { ok: false, error: 'Telefone é obrigatório para pairing code' },
        { status: 400 }
      );
    }

    const result = await getEvolutionPairingCode(params.name, phone_e164);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.raw || 'Falha ao obter pairing code', status: result.status },
        { status: 502 }
      );
    }

    // Evolution pode devolver formatos diferentes, então tentamos os campos comuns
    const data: any = result.data;
    const code =
      safeStr(data?.code) ||
      safeStr(data?.pairingCode) ||
      safeStr(data?.data?.code) ||
      safeStr(data?.data?.pairingCode) ||
      '';

    if (!code) {
      return NextResponse.json(
        { ok: false, error: 'Pairing code vazio', debug: data ?? null },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, data: { code } });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}