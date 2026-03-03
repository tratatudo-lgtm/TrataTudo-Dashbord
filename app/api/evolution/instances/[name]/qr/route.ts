import { NextResponse } from 'next/server';
import { getEvolutionInstanceQR } from '@/lib/evolution';
import { validateAdmin } from '@/lib/auth-admin';

export async function GET(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const { isAdmin } = await validateAdmin();
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });

    const qr = await getEvolutionInstanceQR(params.name);
    return NextResponse.json({ ok: true, data: qr });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
