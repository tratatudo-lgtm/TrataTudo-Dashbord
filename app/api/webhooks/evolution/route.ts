// app/api/webhooks/evolution/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evolutionSendText } from '@/lib/evolution';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeE164FromJid(remoteJid: string) {
  // "3519...@s.whatsapp.net" -> "+3519..."
  const num = safeStr(remoteJid).split('@')[0].replace(/\D/g, '');
  return num ? `+${num}` : '';
}

function extractTextFromEvolutionPayload(body: any) {
  // suporta conversation e extendedTextMessage.text
  const msg = body?.data?.message || {};
  const conv = safeStr(msg?.conversation);
  if (conv) return conv;

  const ext = safeStr(msg?.extendedTextMessage?.text);
  if (ext) return ext;

  return '';
}

async function getClientByPhoneOrInstance(supabase: any, phone_e164: string, instance: string) {
  // regra simples: tenta por telefone primeiro, senão por instância
  // (ajusta se a tua tabela tiver campos diferentes)
  const { data: byPhone } = await supabase
    .from('clients')
    .select('id, status, trial_end, instance_name')
    .eq('phone_e164', phone_e164)
    .limit(1);

  if (byPhone?.[0]) return byPhone[0];

  const { data: byInstance } = await supabase
    .from('clients')
    .select('id, status, trial_end, instance_name')
    .eq('instance_name', instance)
    .limit(1);

  if (byInstance?.[0]) return byInstance[0];

  return null;
}

export async function POST(req: Request) {
  try {
    const secret = safeStr(new URL(req.url).searchParams.get('s'));
    const expected = safeStr(process.env.TRATATUDO_RELAY_SECRET);

    // se tiveres secret, valida
    if (expected && secret !== expected) {
      return NextResponse.json({ ok: false, error: 'invalid_secret' }, { status: 401 });
    }

    const body = await req.json();

    // só processamos inbound
    const event = safeStr(body?.event);
    const instance = safeStr(body?.instance);

    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const fromMe = !!body?.data?.key?.fromMe;
    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'from_me' });
    }

    const remoteJid = safeStr(body?.data?.key?.remoteJid);
    const phone_e164 = normalizeE164FromJid(remoteJid);
    const push_name = safeStr(body?.data?.pushName || '');

    const text = extractTextFromEvolutionPayload(body);
    if (!phone_e164 || !text) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'missing_phone_or_text',
        phone_e164,
      });
    }

    const supabase = createClient();

    const client = await getClientByPhoneOrInstance(supabase, phone_e164, instance);
    const client_id = Number(client?.id || 0);

    if (!client_id) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'client_not_found',
        phone_e164,
        instance,
      });
    }

    // chama o bot/reply interno (API route do teu projeto)
    const baseUrl =
      safeStr(process.env.NEXT_PUBLIC_SITE_URL) ||
      'https://trata-tudo-dashbord.vercel.app';

    const botRes = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/bot/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // webhook é server-to-server, usa chave
        'X-TrataTudo-Key': safeStr(process.env.TRATATUDO_API_KEY),
      },
      body: JSON.stringify({
        client_id,
        phone_e164,
        push_name,
        text,
      }),
    });

    const botRaw = await botRes.text();
    let botJson: any = null;
    try {
      botJson = JSON.parse(botRaw);
    } catch {}

    const reply = safeStr(botJson?.data?.reply);

    if (!botRes.ok || !reply) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'bot_no_reply',
        client_id,
        phone_e164,
        bot_status: botRes.status,
        bot_ok: botRes.ok,
        bot_raw_preview: botRaw?.slice?.(0, 220) || '',
      });
    }

    // envia pelo Evolution
    const evo = await evolutionSendText({
      instance: instance || safeStr(client?.instance_name) || 'TrataTudo bot',
      to_e164: phone_e164,
      text: reply,
    });

    return NextResponse.json({
      ok: true,
      handled: true,
      client_id,
      phone_e164,
      reply_preview: reply.slice(0, 220),
      evolution_send_ok: evo.ok,
      evolution_status: evo.status,
      evolution_raw_preview: safeStr(evo.raw).slice(0, 220),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'internal_error' },
      { status: 500 }
    );
  }
}