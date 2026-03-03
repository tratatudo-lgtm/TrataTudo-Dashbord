import { NextResponse } from 'next/server';
import { getEvolutionPairingCode } from '@/lib/evolution';
import { validateAdmin } from '@/lib/auth-admin';

export async function POST(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const { isAdmin } = await validateAdmin();
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });

    const { phone_e164 } = await request.json();
    if (!phone_e164) return NextResponse.json({ ok: false, error: 'Telefone é obrigatório para pairing code' }, { status: 400 });

    const result = await getEvolutionPairingCode(params.name, phone_e164);
    return NextResponse.json({ ok: true, data: { code: result.code || result } });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
