import { createClient } from '@/lib/supabase/server';
import { sendEvolutionMessage } from '@/lib/evolution';
import { NextResponse } from 'next/server';
import { normalizeE164 } from '@/lib/phone';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { instanceName, text } = body;
    let phone = body.phone || body.number;
    
    if (!instanceName || !phone || !text) {
      throw new Error('Instância, telefone (phone ou number) e texto são obrigatórios');
    }

    const normalized = normalizeE164(phone);
    if (!normalized) throw new Error('Telefone inválido');
    phone = normalized;

    const result = await sendEvolutionMessage(instanceName, phone, text);

    // Opcional: Guardar na tabela de mensagens
    await supabase.from('messages').insert({
      phone,
      text,
      direction: 'out',
      status: 'sent'
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
