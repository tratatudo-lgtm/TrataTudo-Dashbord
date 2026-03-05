import { NextResponse } from 'next/server';
import { createEvolutionInstance, fetchEvolutionInstances } from '@/lib/evolution';
import { validateAdmin } from '@/lib/auth-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const adminCheck = await validateAdmin();
  if (!adminCheck?.isAdmin) {
    return NextResponse.json(
      { ok: false, error: adminCheck?.error || 'Não autorizado' },
      { status: adminCheck?.status || 401 }
    );
  }

  try {
    const result = await fetchEvolutionInstances();

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

export async function POST(req: Request) {
  const adminCheck = await validateAdmin();
  if (!adminCheck?.isAdmin) {
    return NextResponse.json(
      { ok: false, error: adminCheck?.error || 'Não autorizado' },
      { status: adminCheck?.status || 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const instanceName = String(body?.instanceName || '').trim();

    if (!instanceName) {
      return NextResponse.json(
        { ok: false, error: 'instanceName é obrigatório' },
        { status: 400 }
      );
    }

    const result = await createEvolutionInstance(instanceName);

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