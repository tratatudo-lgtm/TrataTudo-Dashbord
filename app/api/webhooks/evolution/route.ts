import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { normalizeE164 } from '@/lib/phone';
import { getBaseUrl } from '@/lib/baseUrl';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Evolution Webhook Received:', JSON.stringify(body, null, 2));

    // Evolution API sends different types of events. We care about messages.upsert
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ ok: true, message: 'Ignored event type' });
    }

    const message = body.data?.message;
    if (!message || message.fromMe) {
      return NextResponse.json({ ok: true, message: 'Ignored self message or empty' });
    }

    const instanceName = body.instance;
    const rawSenderPhone = body.data.key.remoteJid.split('@')[0]; // User's phone
    const botPhone = body.data.key.participant || ''; // Might be bot's phone in groups, or empty
    const text = message.conversation || message.extendedTextMessage?.text || '';

    if (!text) return NextResponse.json({ ok: true, message: 'No text content' });

    const senderPhone = normalizeE164(rawSenderPhone) || rawSenderPhone;

    const supabase = createAdminClient();

    // C3) Lookup robusto
    // 1. Tentar por instance_name
    let { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('instance_name', instanceName)
      .single();

    // 2. Fallback: Tentar por phone_e164 (se tivermos o número do bot)
    // Nota: nem sempre o Evolution manda o número do bot no webhook de forma fácil
    if (!client && botPhone) {
      const formattedBotPhone = '+' + botPhone.replace(/\D/g, '');
      const { data: clientByPhone } = await supabase
        .from('clients')
        .select('*')
        .eq('phone_e164', formattedBotPhone)
        .single();
      client = clientByPhone;
    }

    if (!client) {
      console.error(`Client not found for instance: ${instanceName}`);
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Log incoming message
    await supabase.from('messages').insert({
      phone: senderPhone,
      instance_name: instanceName,
      direction: 'in',
      text: text,
      created_at: new Date().toISOString()
    });

    // Call Groq for AI response
    const baseUrl = getBaseUrl();
    const groqRes = await fetch(`${baseUrl}/api/groq/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        systemPrompt: client.system_prompt,
        phone: senderPhone
      })
    });

    if (!groqRes.ok) throw new Error('Erro ao chamar Groq');
    const groqData = await groqRes.json();
    const aiResponse = groqData.text;

    // Send response back via Evolution
    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;

    await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evoKey!
      },
      body: JSON.stringify({
        number: senderPhone,
        text: aiResponse,
        delay: 1000
      })
    });

    // Log outgoing message
    await supabase.from('messages').insert({
      phone: senderPhone,
      instance_name: instanceName,
      direction: 'out',
      text: aiResponse,
      created_at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
