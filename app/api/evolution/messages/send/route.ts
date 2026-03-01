import { createClient } from '@/lib/supabase/server';
import { sendEvolutionMessage } from '@/lib/evolution';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const { instanceName, phone, text } = await request.json();
    
    if (!instanceName || !phone || !text) {
      throw new Error('Instância, telefone e texto são obrigatórios');
    }

    const result = await sendEvolutionMessage(instanceName, phone, text);

    // Opcional: Guardar na tabela de mensagens
    await supabase.from('messages').insert({
      phone,
      text,
      direction: 'out',
      status: 'sent'
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
