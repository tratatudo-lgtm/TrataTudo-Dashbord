import { NextResponse } from 'next/server';
import { setEvolutionInstanceWebhook } from '@/lib/evolution';
import { validateAdmin } from '@/lib/auth-admin';
import { getBaseUrl } from '@/lib/baseUrl';

export async function POST(
  request: Request,
  { params }: { params: { name: string } }
) {
  try {
    const { isAdmin } = await validateAdmin();
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });

    const baseUrl = getBaseUrl();
    const webhookUrl = `${baseUrl}/api/webhooks/evolution`;
    
    const result = await setEvolutionInstanceWebhook(params.name, webhookUrl);
    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
