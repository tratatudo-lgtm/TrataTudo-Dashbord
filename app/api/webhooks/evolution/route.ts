import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { normalizeE164 } from '@/lib/phone';

const HUB_INSTANCE_NAME = 'TrataTudo bot';

async function resolveClientIdForHubOrInstance(
  supabase: any,
  instanceName: string,
  senderPhone: string
) {
  // 1) Trial / Hub partilhado: resolver pelo número do cliente
  if (instanceName === HUB_INSTANCE_NAME) {
    const { data: clientByPhone, error: clientByPhoneError } = await supabase
      .from('clients')
      .select('id, phone_e164, status')
      .eq('phone_e164', senderPhone)
      .maybeSingle();

    if (clientByPhoneError) throw clientByPhoneError;

    if (!clientByPhone) {
      return null;
    }

    const { data: hubLink, error: hubLinkError } = await supabase
      .from('client_instances')
      .select('id, client_id, instance_name, is_hub, status')
      .eq('client_id', clientByPhone.id)
      .eq('instance_name', HUB_INSTANCE_NAME)
      .eq('is_hub', true)
      .eq('status', 'active')
      .maybeSingle();

    if (hubLinkError) throw hubLinkError;

    return hubLink ? clientByPhone.id : null;
  }

  // 2) Instância privada: resolver pela instância
  const { data: instanceLink, error: instanceLinkError } = await supabase
    .from('client_instances')
    .select('client_id, instance_name, is_hub, status')
    .eq('instance_name', instanceName)
    .eq('status', 'active')
    .maybeSingle();

  if (instanceLinkError) throw instanceLinkError;
  if (instanceLink?.client_id) return instanceLink.client_id;

  // 3) Fallback legado
  const { data: clientLegacy, error: clientLegacyError } = await supabase
    .from('clients')
    .select('id')
    .or(`instance_name.eq.${instanceName},production_instance_name.eq.${instanceName}`)
    .maybeSingle();

  if (clientLegacyError) throw clientLegacyError;

  return clientLegacy?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Evolution Webhook Received:', JSON.stringify(body, null, 2));

    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ ok: true, message: 'Ignored event type' });
    }

    const message = body.data?.message;
    if (!message || message.fromMe) {
      return NextResponse.json({ ok: true, message: 'Ignored self message or empty' });
    }

    const instanceName = body.instance;
    const rawSenderPhone = body.data?.key?.remoteJid?.split('@')[0];
    const text =
      message.conversation ||
      message.extendedTextMessage?.text ||
      '';

    if (!instanceName || !rawSenderPhone || !text) {
      return NextResponse.json({ ok: true, message: 'Missing instance, sender or text' });
    }

    const senderPhone = normalizeE164(rawSenderPhone) || rawSenderPhone;
    const supabase = createAdminClient();

    const clientId = await resolveClientIdForHubOrInstance(
      supabase,
      instanceName,
      senderPhone
    );

    if (!clientId) {
      console.error(`Client not found for instance=${instanceName} sender=${senderPhone}`);
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, bot_instructions')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found after resolution' }, { status: 404 });
    }

    await supabase.from('wa_messages').insert({
      client_id: client.id,
      phone_e164: senderPhone,
      instance: instanceName,
      direction: 'in',
      text,
      raw: body,
      created_at: new Date().toISOString(),
    });

    const groqRes = await fetch(`${process.env.APP_URL}/api/groq/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        systemPrompt: client.bot_instructions,
        phone: senderPhone,
        client_id: client.id,
        instance: instanceName,
      }),
    });

    if (!groqRes.ok) {
      throw new Error('Erro ao chamar Groq');
    }

    const groqData = await groqRes.json();
    const aiResponse = groqData.text;

    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;

    await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evoKey!,
      },
      body: JSON.stringify({
        number: senderPhone.replace('+', ''),
        text: aiResponse,
        delay: 1000,
      }),
    });

    await supabase.from('wa_messages').insert({
      client_id: client.id,
      phone_e164: senderPhone,
      instance: instanceName,
      direction: 'out',
      text: aiResponse,
      raw: { generated: true },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, client_id: client.id });
  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}