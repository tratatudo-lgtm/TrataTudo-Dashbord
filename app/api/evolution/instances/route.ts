import { NextResponse } from 'next/server';
import { fetchEvolutionInstances, createEvolutionInstance } from '@/lib/evolution';
import { validateAdmin } from '@/lib/auth-admin';

export async function GET() {
  try {
    const { isAdmin } = await validateAdmin();
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });

    const instances = await fetchEvolutionInstances();
    return NextResponse.json({ ok: true, instances });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { isAdmin } = await validateAdmin();
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const instanceName = body.instanceName || body.instance_name;
    const number = body.number || '';
    
    if (!instanceName) return NextResponse.json({ ok: false, error: 'Nome da instância é obrigatório' }, { status: 400 });

    const result = await createEvolutionInstance(instanceName, number);
    return NextResponse.json({ ok: true, result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
