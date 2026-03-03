import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function normalizeE164(phone: string) {
  if (!phone) return phone;
  let cleaned = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.startsWith('351')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.startsWith('9') || cleaned.startsWith('2')) {
      cleaned = '+351' + cleaned;
    }
  }
  return cleaned;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    let instanceName = body.instance || body.instanceName;
    let phone = body.phone || body.number;
    let text = body.text;
    let clientId = body.client_id;

    const supabase = createClient();

    // 🔥 Se não vier instance, tentar buscar automaticamente pelo client_id
    if (!instanceName && clientId) {
      const { data } = await supabase
        .from('client_instances')
        .select('instance_name')
        .eq('client_id', clientId)
        .order('id', { ascending: false })
        .limit(1)
        .single();

      if (data?.instance_name) {
        instanceName = data.instance_name;
      }
    }

    if (!instanceName || !phone || !text) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Instância, telefone (phone ou number) e texto são obrigatórios'
        },
        { status: 400 }
      );
    }

    const normalized = normalizeE164(phone);

    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_API_KEY;

    if (!evolutionUrl || !evolutionKey) {
      return NextResponse.json(
        { ok: false, error: 'Evolution API não configurada' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `${evolutionUrl}/message/sendText/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolutionKey
        },
        body: JSON.stringify({
          number: normalized.replace('+', ''),
          text
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: result },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    console.error('Erro ao enviar mensagem via Evolution API:', error);
    return NextResponse.json(
      { ok: false, error: 'Erro ao enviar mensagem via Evolution API' },
      { status: 500 }
    );
  }
}