import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HUB_INSTANCE_NAME = 'TrataTudo bot';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function jidToE164(jid: string): string {
  const raw = safeStr(jid).split('@')[0].replace(/[^\d]/g, '');
  if (!raw) return '';
  return raw.startsWith('00') ? `+${raw.slice(2)}` : raw.startsWith('+') ? raw : `+${raw}`;
}

function e164ToEvolutionNumber(e164: string): string {
  return safeStr(e164).replace(/[^\d]/g, '');
}

function checkRelaySecret(req: Request): boolean {
  const url = new URL(req.url);
  const got = safeStr(url.searchParams.get('s'));
  const expected = safeStr(process.env.RELAY_SECRET || process.env.WA_RELAY_SECRET);
  if (!expected) return true;
  return got === expected;
}

async function sendEvolutionText(instanceName: string, toE164: string, text: string) {
  const serverUrl = safeStr(
    process.env.EVOLUTION_SERVER_URL ||
      process.env.EVOLUTION_API_URL ||
      process.env.EVO_URL ||
      process.env.SERVER_URL
  );

  const apiKey = safeStr(
    process.env.EVOLUTION_API_KEY ||
      process.env.EVO_KEY ||
      process.env.AUTHENTICATION_API_KEY
  );

  if (!serverUrl || !apiKey) {
    return {
      ok: false,
      status: 0,
      raw: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
    };
  }

  const url = `${serverUrl.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(instanceName)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: e164ToEvolutionNumber(toE164),
      text,
    }),
  });

  const raw = await res.text();

  return {
    ok: res.ok,
    status: res.status,
    raw: raw.slice(0, 300),
  };
}

async function resolveClientIdForHubOrInstance(
  supabase: any,
  instanceName: string,
  fromPhoneE164: string
): Promise<number | null> {
  // =========================================================
  // 1) HUB PARTILHADO / TRIAL
  // =========================================================
  // No hub "TrataTudo bot", o cliente é identificado pelo número.
  if (instanceName === HUB_INSTANCE_NAME) {
    const { data: clientRows, error: clientError } = await supabase
      .from('clients')
      .select('id, phone_e164, status')
      .eq('phone_e164', fromPhoneE164)
      .limit(1);

    if (clientError) throw clientError;

    const client = clientRows?.[0];
    if (!client?.id) return null;

    const clientId = Number(client.id);

    // Confirmar que este cliente está ligado ativamente ao hub
    const { data: hubRows, error: hubError } = await supabase
      .from('client_instances')
      .select('client_id, instance_name, is_hub, status')
      .eq('client_id', clientId)
      .eq('instance_name', HUB_INSTANCE_NAME)
      .eq('is_hub', true)
      .eq('status', 'active')
      .limit(1);

    if (hubError) throw hubError;

    if (hubRows?.[0]?.client_id) {
      return clientId;
    }

    return null;
  }

  // =========================================================
  // 2) INSTÂNCIA PRIVADA / PRODUÇÃO
  // =========================================================
  // Fora do hub, o cliente é identificado pela instância ativa.
  const { data: instanceRows, error: instanceError } = await supabase
    .from('client_instances')
    .select('client_id, instance_name, is_hub, status')
    .eq('instance_name', instanceName)
    .eq('is_hub', false)
    .eq('status', 'active')
    .limit(1);

  if (instanceError) throw instanceError;

  const instanceMatch = instanceRows?.[0];
  if (instanceMatch?.client_id) {
    return Number(instanceMatch.client_id);
  }

  // =========================================================
  // 3) FALLBACK LEGADO
  // =========================================================
  // Mantido só para compatibilidade com dados antigos.
  const { data: legacyRows, error: legacyError } = await supabase
    .from('clients')
    .select('id, production_instance_name')
    .eq('production_instance_name', instanceName)
    .limit(1);

  if (legacyError) throw legacyError;

  const legacyClient = legacyRows?.[0];
  if (legacyClient?.id) {
    return Number(legacyClient.id);
  }

  return null;
}

export async function POST(req: Request) {
  try {
    if (!checkRelaySecret(req)) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const event = safeStr(body?.event);
    const instanceName = safeStr(body?.instance);

    if (event !== 'messages.upsert' || !instanceName) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const key = body?.data?.key || {};
    const fromMe = !!key?.fromMe;

    if (fromMe) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        reason: 'from_me',
      });
    }

    const remoteJid = safeStr(key?.remoteJid);
    const fromPhoneE164 = jidToE164(remoteJid);

    const text =
      safeStr(body?.data?.message?.conversation) ||
      safeStr(body?.data?.message?.extendedTextMessage?.text) ||
      safeStr(body?.data?.message?.imageMessage?.caption) ||
      safeStr(body?.data?.message?.videoMessage?.caption);

    const pushName = safeStr(body?.data?.pushName || '');

    if (!fromPhoneE164 || !text) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'missing_phone_or_text',
      });
    }

    const supabase = createClient();

    // Resolver cliente de forma correta:
    // - hub trial => por número
    // - instância privada => por instância
    const client_id = await resolveClientIdForHubOrInstance(
      supabase,
      instanceName,
      fromPhoneE164
    );

    if (!client_id) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'client_not_found',
        instance: instanceName,
        phone_e164: fromPhoneE164,
      });
    }

    const baseUrl = safeStr(process.env.NEXT_PUBLIC_BASE_URL) || new URL(req.url).origin;
    const botUrl = `${baseUrl}/api/bot/reply`;
    const apiKey = safeStr(process.env.TRATATUDO_API_KEY);

    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'missing_TRATATUDO_API_KEY',
        client_id,
        phone_e164: fromPhoneE164,
      });
    }

    const botRes = await fetch(botUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TrataTudo-Key': apiKey,
      },
      body: JSON.stringify({
        client_id,
        phone_e164: fromPhoneE164,
        push_name: pushName,
        text,
        instance: instanceName,
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
        phone_e164: fromPhoneE164,
        bot_status: botRes.status,
        bot_ok: botRes.ok,
        bot_raw_preview: botRaw.slice(0, 180),
      });
    }

    const evo = await sendEvolutionText(instanceName, fromPhoneE164, reply);

    return NextResponse.json({
      ok: true,
      handled: true,
      client_id,
      phone_e164: fromPhoneE164,
      instance: instanceName,
      reply_preview: reply.slice(0, 160),
      evolution_send_ok: evo.ok,
      evolution_status: evo.status,
      evolution_raw_preview: safeStr(evo.raw).slice(0, 220),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'internal_error',
      },
      { status: 500 }
    );
  }
}