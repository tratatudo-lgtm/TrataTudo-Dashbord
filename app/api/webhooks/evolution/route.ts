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
    const text = message.conversation || message.extendedTextMessage?.text || '';

    if (!text) return NextResponse.json({ ok: true, message: 'No text content' });

    const senderPhone = normalizeE164(rawSenderPhone) || ('+' + rawSenderPhone.replace(/\D/g, ''));
    console.log(`[Webhook] Instance: ${instanceName} | Sender: ${senderPhone}`);

    const supabase = createAdminClient();
    let client: any = null;
    const hubInstanceName = process.env.HUB_INSTANCE_NAME || 'HUB';

    if (instanceName === hubInstanceName) {
      const { data: hubClient } = await supabase
        .from('clients')
        .select('*')
        .eq('phone_e164', senderPhone)
        .single();

      if (hubClient) {
        console.log(`[HUB] Client found: ${hubClient.company_name} (${hubClient.status})`);
        const now = new Date();
        const trialEnd = hubClient.trial_end ? new Date(hubClient.trial_end) : null;
        const isTrialValid = hubClient.status === 'trial' && trialEnd && trialEnd > now;
        const isActive = hubClient.status === 'active';

        if (isActive || isTrialValid) {
          client = hubClient;
        } else {
          console.log(`[HUB] Client ${senderPhone} expired or inactive.`);
          await sendEvolutionMessage(instanceName, senderPhone, "Número não reconhecido ou teste expirado...");
          return NextResponse.json({ ok: true, message: 'Expired/Inactive' });
        }
      } else {
        console.log(`[HUB] Client NOT found for phone: ${senderPhone}`);
        await sendEvolutionMessage(instanceName, senderPhone, "Número não reconhecido ou teste expirado...");
        return NextResponse.json({ ok: true, message: 'Not found' });
      }
    } else {
      // Production instance logic: identify by production_instance_name
      let { data: prodClient } = await supabase
        .from('clients')
        .select('*')
        .eq('production_instance_name', instanceName)
        .single();

      // Fallback to instance_name if production_instance_name not found
      if (!prodClient) {
        let { data: dedicatedClient } = await supabase
          .from('clients')
          .select('*')
          .eq('instance_name', instanceName)
          .single();
        prodClient = dedicatedClient;
      }

      client = prodClient;
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
        systemPrompt: client.bot_instructions || client.system_prompt || '',
        phone: senderPhone
      })
    });

    if (!groqRes.ok) throw new Error('Erro ao chamar Groq');
    const groqData = await groqRes.json();
    const aiResponse = groqData.text;

    // Send response back via Evolution
    await sendEvolutionMessage(instanceName, senderPhone, aiResponse);

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

async function sendEvolutionMessage(instanceName: string, number: string, text: string) {
  const evoUrl = process.env.EVOLUTION_API_URL;
  const evoKey = process.env.EVOLUTION_API_KEY;

  if (!evoUrl || !evoKey) {
    console.error('Evolution API credentials missing');
    return;
  }

  try {
    await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evoKey
      },
      body: JSON.stringify({
        number: number.replace('+', ''),
        text: text,
        delay: 1000
      })
    });
  } catch (error) {
    console.error('Error sending Evolution message:', error);
  }
}
