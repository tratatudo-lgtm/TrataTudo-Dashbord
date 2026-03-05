import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizePhoneE164FromRemoteJid(remoteJid: string) {
  // Evolution costuma mandar "3519...@s.whatsapp.net" ou "3519..."
  const digits = safeStr(remoteJid).split('@')[0].replace(/[^\d]/g, '');
  if (!digits) return '';
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function pickTextFromWebhookPayload(data: any): string {
  // cobre formatos comuns do Evolution
  const msg = data?.message;
  if (!msg) return '';

  if (typeof msg?.conversation === 'string') return msg.conversation;
  if (typeof msg?.extendedTextMessage?.text === 'string') return msg.extendedTextMessage.text;
  if (typeof msg?.imageMessage?.caption === 'string') return msg.imageMessage.caption;
  if (typeof msg?.videoMessage?.caption === 'string') return msg.videoMessage.caption;
  if (typeof msg?.documentMessage?.caption === 'string') return msg.documentMessage.caption;

  return '';
}

function getRelaySecretFromReq(req: Request) {
  const url = new URL(req.url);
  const s = url.searchParams.get('s') || '';
  return s;
}

function getExpectedRelaySecret() {
  return (
    process.env.TRATATUDO_RELAY_SECRET ||
    process.env.WA_RELAY_SECRET ||
    process.env.RELAY_SECRET ||
    ''
  );
}

function getHubInstanceName() {
  return process.env.HUB_INSTANCE_NAME || 'TrataTudo bot';
}

function getEvolutionConfig() {
  // aceita vários nomes (para não te obrigar a renomear env agora)
  const baseUrl =
    (process.env.EVOLUTION_SERVER_URL ||
      process.env.EVOLUTION_URL ||
      process.env.EVO_URL ||
      '').replace(/\/$/, '');

  const apiKey =
    process.env.EVOLUTION_API_KEY ||
    process.env.EVOLUTION_APIKEY ||
    process.env.EVO_KEY ||
    process.env.AUTHENTICATION_API_KEY ||
    '';

  return { baseUrl, apiKey };
}

async function sendTextToEvolution(instance: string, toE164: string, text: string) {
  const { baseUrl, apiKey } = getEvolutionConfig();
  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      status: 0,
      raw: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
    };
  }

  const instanceEnc = encodeURIComponent(instance);
  const url = `${baseUrl}/message/sendText/${instanceEnc}`;

  // Evolution quer número SEM "+" (normalmente)
  const numberDigits = toE164.replace(/[^\d]/g, '');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({ number: numberDigits, text }),
  });

  const raw = await res.text();
  return { ok: res.ok, status: res.status, raw: raw.slice(0, 500) };
}

/**
 * Resolve client_id:
 * - Se instance != HUB => procura clients.instance_name = instance
 * - Se instance == HUB => procura client_instances por phone_e164 (e opcionalmente instance/hub)
 */
async function resolveClientId(supabase: any, instanceName: string, phoneE164: string) {
  const hub = getHubInstanceName();

  // 1) Se for instância dedicada: client pelo instance_name
  if (instanceName && instanceName !== hub) {
    const { data: c1 } = await supabase
      .from('clients')
      .select('id')
      .eq('instance_name', instanceName)
      .limit(1)
      .maybeSingle();

    if (c1?.id) return Number(c1.id);
  }

  // 2) HUB: mapping por número -> client_instances
  // tenta vários nomes de colunas comuns sem rebentar:
  // client_instances: client_id, phone_e164, instance_name, enabled, updated_at
  const q = supabase
    .from('client_instances')
    .select('client_id, enabled, instance_name, updated_at')
    .eq('phone_e164', phoneE164);

  // se existir instance_name na tabela, filtramos pelo hub (não faz mal se não existir – supabase devolve erro; por isso try/catch)
  let rows: any[] = [];
  try {
    const { data } = await q.order('updated_at', { ascending: false }).limit(10);
    if (Array.isArray(data)) rows = data;
  } catch {
    // fallback: sem order/updated_at
    try {
      const { data } = await supabase
        .from('client_instances')
        .select('client_id, enabled, instance_name')
        .eq('phone_e164', phoneE164)
        .limit(10);
      if (Array.isArray(data)) rows = data;
    } catch {
      rows = [];
    }
  }

  // filtra enabled quando existir
  const enabledRows = rows.filter((r) => r?.enabled === true || r?.enabled === null || r?.enabled === undefined);

  // preferir os que batem no hub (se tiver instance_name)
  const hubRows = enabledRows.filter((r) => !r?.instance_name || r?.instance_name === hub);

  const pick = (hubRows[0] || enabledRows[0] || rows[0])?.client_id;
  if (pick) return Number(pick);

  // 3) fallback final: DEMO id 1 (ou devolve null)
  return null;
}

export async function POST(req: Request) {
  try {
    const expectedSecret = getExpectedRelaySecret();
    const gotSecret = getRelaySecretFromReq(req);

    if (expectedSecret && gotSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: 'invalid_secret' }, { status: 401 });
    }

    const payload = await req.json();

    const event = safeStr(payload?.event);
    const instance = safeStr(payload?.instance);
    const data = payload?.data || {};

    // Só tratamos inbound messages.upsert
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true, ignored: true, reason: 'event_not_supported' });
    }

    // Ignorar mensagens "fromMe"
    const fromMe = Boolean(data?.key?.fromMe);
    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'from_me' });
    }

    const remoteJid = safeStr(data?.key?.remoteJid);
    const phone_e164 = normalizePhoneE164FromRemoteJid(remoteJid);
    const push_name = safeStr(data?.pushName || '');

    const text = safeStr(pickTextFromWebhookPayload(data));
    if (!phone_e164 || !text) {
      return NextResponse.json({ ok: true, handled: false, reason: 'missing_phone_or_text' });
    }

    const supabase = createClient();

    const client_id = await resolveClientId(supabase, instance, phone_e164);
    if (!client_id) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'client_not_found_for_number',
        instance,
        phone_e164,
      });
    }

    // chama o bot (MESMA origem do request para evitar DEPLOYMENT_NOT_FOUND)
    const origin = new URL(req.url).origin;
    const botRes = await fetch(`${origin}/api/bot/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Nota: aqui NÃO usamos X-TrataTudo-Key, porque é chamada interna do webhook
      body: JSON.stringify({
        client_id,
        phone_e164,
        push_name,
        text,
      }),
    });

    const botRaw = await botRes.text();
    let botJson: any = null;
    try { botJson = JSON.parse(botRaw); } catch {}

    const reply = safeStr(botJson?.data?.reply || '');
    if (!reply) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'bot_no_reply',
        client_id,
        phone_e164,
        bot_status: botRes.status,
        bot_ok: botRes.ok,
        bot_raw_preview: botRaw.slice(0, 200),
      });
    }

    // envia reply para o WhatsApp via Evolution
    const evo = await sendTextToEvolution(instance || getHubInstanceName(), phone_e164, reply);

    return NextResponse.json({
      ok: true,
      handled: true,
      client_id,
      phone_e164,
      reply_preview: reply.slice(0, 200),
      evolution_send_ok: evo.ok,
      evolution_status: evo.status,
      evolution_raw_preview: safeStr(evo.raw).slice(0, 200),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'internal_error' }, { status: 500 });
  }
}