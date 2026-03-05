import { NextResponse } from 'next/server';
import { setEvolutionInstanceWebhook } from '@/lib/evolution';
import { validateAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { name: string } }
) {
  const adminCheck = await validateAdmin();
  if (!adminCheck?.isAdmin) {
    return NextResponse.json(
      { ok: false, error: adminCheck?.error || 'Não autorizado' },
      { status: adminCheck?.status || 401 }
    );
  }

  try {
    // lib/evolution.ts lê EVOLUTION_WEBHOOK_URL do env
    const result = await setEvolutionInstanceWebhook(params.name);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || 'Erro no Evolution', details: result.raw },
        { status: result.status || 500 }
      );
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}