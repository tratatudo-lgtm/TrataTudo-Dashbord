import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizePhoneE164FromRemoteJid(remoteJid: string) {
  // ex: "351937230116@s.whatsapp.net" -> "+351937230116"
  const jid = safeStr(remoteJid);
  const num = jid.split('@')[0] || '';
  const onlyDigits = num.replace(/[^\d]/g, '');
  if (!onlyDigits) return '';
  return onlyDigits.startsWith('351') ? `+${onlyDigits}` : `+${onlyDigits}`;
}

function getTextFromEvolutionPayload(data: any) {
  // tenta apanhar texto em formatos comuns
  const msg = data?.message || {};
  const conv = msg?.conversation;
  const ext = msg?.extendedTextMessage?.text;
  const img = msg?.imageMessage?.caption;
  const vid = msg?.videoMessage?.caption;
  const doc = msg?.documentMessage?.caption;
  return safeStr(conv || ext || img || vid || doc);
}

async function evoSendText(instance: string, toE164: string, text: string) {
  const evoUrl = safeStr(process.env.EVOLUTION_SERVER_URL);
  const evoKey = safeStr(process.env.EVOLUTION_API_KEY);
  if (!evoUrl || !evoKey) {
    return { ok: false, status: 0, raw: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY' };
  }

  // Evolution API: /message/sendText/<instance> (é o que tu já usaste no VPS)
  const url = `${evoUrl}/message/sendText/${encodeURIComponent(instance)}`;

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: evoKey,
    },
    body: JSON.stringify({
      number: toE164.replace(/^\+/, ''), // muitas configs da Evolution aceitam "351..."
      text,
    }),
  });

  const raw = await r.text();
  return { ok: r.ok, status: r.status, raw: raw.slice(0, 800) };
}

async function callBotReply(baseUrl: string, apiKey: string, payload: any) {
  const r = await fetch(`${baseUrl}/api/bot/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-TrataTudo-Key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const raw = await r.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch { json = null; }
  return { ok: r.ok, status: r.status, raw: raw.slice(0, 800), json };
}

async function resolveClientId(supabase: any, instance: string, phone_e164: string) {
  const inst = safeStr(instance);

  // 1) instância dedicada: "client-6"
  const m = inst.match(/^client-(\d+)$/i);
  if (m?.[1]) return Number(m[1]);

  // 2) procurar por instance_name na tabela clients
  {
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('instance_name', inst)
      .limit(1);

    const id = Number(data?.[0]?.id);
    if (id) return id;
  }

  // 3) hub: mapping por número
  {
    const HUB_DEFAULT = safeStr(process.env.HUB_INSTANCE_NAME || 'TrataTudo bot');
    if (inst === HUB_DEFAULT) {
      const { data } = await supabase
        .from('hub_client_numbers')
        .select('client_id, enabled')
        .eq('phone_e164', phone_e164)
        .limit(1);

      const row = data?.[0];
      if (row?.enabled && Number(row?.client_id)) return Number(row.client_id);
    }
  }

  // 4) fallback demo
  return Number(process.env.FALLBACK_CLIENT_ID || 1);
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const secret = safeStr(url.searchParams.get('s'));
    const expected = safeStr(process.env.RELAY_SECRET || process.env.TRATATUDO_RELAY_SECRET);

    if (!expected || secret !== expected) {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });

    const event = safeStr(body.event);
    const instance = safeStr(body.instance);
    const data = body.data || {};

    // só tratamos mensagens recebidas (inbound)
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const remoteJid = safeStr(data?.key?.remoteJid);
    const fromMe = !!data?.key?.fromMe;

    if (!remoteJid || fromMe) {
      return NextResponse.json({ ok: true, handled: false, reason: 'not_inbound' });
    }

    const phone_e164 = normalizePhoneE164FromRemoteJid(remoteJid);
    const text = getTextFromEvolutionPayload(data);
    const push_name = safeStr(data?.pushName || '');

    if (!phone_e164 || !text) {
      return NextResponse.json({ ok: true, handled: false, reason: 'missing_phone_or_text' });
    }

    const supabase = createClient();
    const client_id = await resolveClientId(supabase, instance, phone_e164);

    // chama bot/reply (server-to-server)
    const baseUrl = safeStr(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://trata-tudo-dashbord.vercel.app');
    const apiKey = safeStr(process.env.TRATATUDO_API_KEY);

    if (!apiKey) {
      return NextResponse.json({
        ok: true,
        handled: true,
        client_id,
        phone_e164,
        reply_preview: null,
        evolution_send_ok: false,
        evolution_status: 0,
        evolution_raw_preview: 'missing_TRATATUDO_API_KEY',
      });
    }

    const botRes = await callBotReply(baseUrl, apiKey, {
      client_id,
      phone_e164,
      push_name,
      text,
    });

    if (!botRes.ok || !botRes.json?.ok) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: 'bot_no_reply',
        client_id,
        phone_e164,
        bot_status: botRes.status,
        bot_ok: botRes.json?.ok ?? false,
        bot_raw_preview: botRes.raw,
      });
    }

    const reply = safeStr(botRes.json?.data?.reply);
    if (!reply) {
      return NextResponse.json({ ok: true, handled: false, reason: 'empty_reply', client_id, phone_e164 });
    }

    // envia reply via Evolution
    const evo = await evoSendText(instance, phone_e164, reply);

    return NextResponse.json({
      ok: true,
      handled: true,
      client_id,
      phone_e164,
      reply_preview: reply.slice(0, 160),
      evolution_send_ok: evo.ok,
      evolution_status: evo.status,
      evolution_raw_preview: evo.raw,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}