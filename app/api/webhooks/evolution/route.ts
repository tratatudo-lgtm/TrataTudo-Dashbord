// app/api/webhooks/evolution/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizeE164FromRemoteJid(remoteJid: string) {
  // Ex: "351937230116@s.whatsapp.net" -> "+351937230116"
  const num = safeStr(remoteJid).split('@')[0].replace(/[^\d+]/g, '');
  if (!num) return '';
  return num.startsWith('+') ? num : `+${num}`;
}

function extractTextFromEvolutionPayload(payload: any): string {
  const msg = payload?.data?.message || payload?.message || {};
  // Baileys / Evolution podem mandar em vários formatos
  return (
    safeStr(msg?.conversation) ||
    safeStr(msg?.extendedTextMessage?.text) ||
    safeStr(msg?.text) ||
    safeStr(payload?.data?.message?.extendedTextMessage?.text) ||
    ''
  );
}

async function resolveClientIdByHubOverrideOrClient(
  supabase: any,
  instance_name: string,
  phone_e164: string
): Promise<number | null> {
  // 1) override por número (o que tu queres: DEMO pode usar prompt do cliente 6)
  const { data: ov } = await supabase
    .from('hub_phone_overrides')
    .select('effective_client_id')
    .eq('instance_name', instance_name)
    .eq('phone_e164', phone_e164)
    .eq('enabled', true)
    .maybeSingle();

  if (ov?.effective_client_id) return Number(ov.effective_client_id);

  // 2) fallback: tentar achar cliente normal pelo phone + instance
  const { data: c } = await supabase
    .from('clients')
    .select('id')
    .eq('instance_name', instance_name)
    .eq('phone_e164', phone_e164)
    .maybeSingle();

  if (c?.id) return Number(c.id);

  return null;
}

async function sendTextViaEvolution(instance: string, toE164: string, text: string) {
  const evoUrl = safeStr(process.env.EVOLUTION_API_URL);
  const evoKey = safeStr(process.env.EVOLUTION_API_KEY);

  if (!evoUrl || !evoKey) {
    return { ok: false, error: 'missing_evolution_env' as const };
  }

  const url = `${evoUrl.replace(/\/+$/, '')}/message/sendText/${encodeURIComponent(instance)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: evoKey,
    },
    body: JSON.stringify({
      number: toE164.replace(/^\+/, ''), // Evolution geralmente quer sem "+"
      text,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, error: 'evolution_send_failed' as const, status: res.status, raw };
  }
  return { ok: true, raw };
}

export async function POST(req: Request) {
  // ⚠️ Regra de ouro: este endpoint NÃO pode devolver 500.
  // Mesmo com erro, devolve 200 e um JSON com reason, para o Evolution não entrar em fallback.
  try {
    const url = new URL(req.url);

    const secret = safeStr(url.searchParams.get('s'));
    const expected = safeStr(process.env.TRATATUDO_RELAY_SECRET);

    if (!expected || secret !== expected) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'bad_secret' }, { status: 200 });
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'invalid_json' }, { status: 200 });
    }

    const event = safeStr(payload.event);
    const instance_name = safeStr(payload.instance);

    // Só processamos mensagens recebidas
    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true, ignored: true, reason: 'not_messages_upsert' }, { status: 200 });
    }

    const fromMe = !!payload?.data?.key?.fromMe;
    const remoteJid = safeStr(payload?.data?.key?.remoteJid);
    const phone_e164 = normalizeE164FromRemoteJid(remoteJid);
    const push_name = safeStr(payload?.data?.pushName);

    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'from_me' }, { status: 200 });
    }
    if (!instance_name || !phone_e164) {
      return NextResponse.json(
        { ok: true, ignored: true, reason: 'missing_instance_or_phone', instance_name, remoteJid },
        { status: 200 }
      );
    }

    const text = extractTextFromEvolutionPayload(payload);
    if (!text) {
      return NextResponse.json({ ok: true, ignored: true, reason: 'no_text' }, { status: 200 });
    }

    const supabase = createClient();

    // Resolve qual client_id deve ser usado (override por número -> o que tu queres)
    const client_id = await resolveClientIdByHubOverrideOrClient(supabase, instance_name, phone_e164);

    if (!client_id) {
      // Não encontramos client associado a este número na instância
      // Não crasha, apenas ignora.
      return NextResponse.json(
        { ok: true, ignored: true, reason: 'client_not_found', instance_name, phone_e164 },
        { status: 200 }
      );
    }

    // Chamar o bot (internamente via HTTP)
    const base =
      safeStr(process.env.NEXT_PUBLIC_SITE_URL) ||
      `https://${safeStr(req.headers.get('host'))}`;

    const apiKey = safeStr(process.env.TRATATUDO_API_KEY);
    if (!apiKey) {
      return NextResponse.json(
        { ok: true, handled: false, reason: 'missing_TRATATUDO_API_KEY_env' },
        { status: 200 }
      );
    }

    const botRes = await fetch(`${base.replace(/\/+$/, '')}/api/bot/reply`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tratatudo-key': apiKey,
      },
      body: JSON.stringify({
        client_id,
        phone_e164,
        push_name,
        text,
      }),
    });

    const botJson = await botRes.json().catch(() => null);

    const reply = safeStr(botJson?.data?.reply);
    if (!reply) {
      return NextResponse.json(
        { ok: true, handled: false, reason: 'bot_no_reply', client_id, phone_e164 },
        { status: 200 }
      );
    }

    // Enviar resposta via Evolution
    const send = await sendTextViaEvolution(instance_name, phone_e164, reply);

    // Nunca 500: sempre 200
    return NextResponse.json(
      {
        ok: true,
        handled: true,
        client_id,
        phone_e164,
        instance_name,
        send,
      },
      { status: 200 }
    );
  } catch (err: any) {
    // NUNCA devolver 500 ao Evolution
    return NextResponse.json(
      { ok: true, handled: false, reason: 'exception', message: safeStr(err?.message) },
      { status: 200 }
    );
  }
}