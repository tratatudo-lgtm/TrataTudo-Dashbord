import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

function getBaseUrlFromRequest(req: Request) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "";
  return `${proto}://${host}`;
}

function getCanonicalBaseUrl(req: Request) {
  const envBase = safeStr(process.env.APP_BASE_URL);
  if (envBase) return envBase.replace(/\/+$/, "");
  return getBaseUrlFromRequest(req).replace(/\/+$/, "");
}

function validateRelaySecret(req: Request) {
  const secret = safeStr(process.env.TRATATUDO_RELAY_SECRET);
  if (!secret) return { ok: false, error: "missing_env_TRATATUDO_RELAY_SECRET" };

  const url = new URL(req.url);
  const s = safeStr(url.searchParams.get("s"));
  if (!s || s !== secret) return { ok: false, error: "invalid_relay_secret" };

  return { ok: true };
}

function normalizeE164FromRemoteJid(remoteJid: string) {
  // "3519xxxx@s.whatsapp.net" -> "+3519xxxx"
  const jid = safeStr(remoteJid);
  const num = jid.split("@")[0] || "";
  if (!num) return "";
  return num.startsWith("+") ? num : `+${num}`;
}

function extractTextFromEvolutionPayload(p: any) {
  return (
    safeStr(p?.data?.message?.conversation) ||
    safeStr(p?.data?.message?.extendedTextMessage?.text) ||
    safeStr(p?.data?.message?.imageMessage?.caption) ||
    ""
  );
}

async function sendTextViaEvolution(instance: string, toE164: string, text: string) {
  const evoUrl = safeStr(process.env.EVOLUTION_SERVER_URL).replace(/\/+$/, "");
  const evoKey = safeStr(process.env.EVOLUTION_API_KEY);

  if (!evoUrl || !evoKey) {
    return { ok: false, status: 0, raw: "missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY" };
  }

  // Evolution espera number sem "+" normalmente; mas aceita em muitos setups.
  // Para ficar consistente, removo "+" aqui:
  const number = toE164.replace(/^\+/, "");

  const url = `${evoUrl}/message/sendText/${encodeURIComponent(instance)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: evoKey,
    },
    body: JSON.stringify({
      number,
      text,
    }),
  });

  const raw = await res.text();
  return { ok: res.ok, status: res.status, raw: raw.slice(0, 400) };
}

export async function POST(req: Request) {
  try {
    const v = validateRelaySecret(req);
    if (!v.ok) return json({ ok: false, error: v.error }, 401);

    const payload = await req.json().catch(() => null);
    if (!payload) return json({ ok: false, error: "invalid_json" }, 400);

    const event = safeStr(payload.event);
    const instance = safeStr(payload.instance);
    const fromMe = Boolean(payload?.data?.key?.fromMe);

    // Só processa inbound
    if (event !== "messages.upsert" || fromMe) {
      return json({ ok: true, ignored: true, reason: "not_inbound_message" });
    }

    const remoteJid = safeStr(payload?.data?.key?.remoteJid);
    const phone_e164 = normalizeE164FromRemoteJid(remoteJid);
    const pushName = safeStr(payload?.data?.pushName || payload?.pushName || "");
    const text = extractTextFromEvolutionPayload(payload);

    if (!phone_e164 || !text) {
      return json({
        ok: true,
        handled: false,
        reason: "missing_phone_or_text",
        phone_e164,
      });
    }

    const baseUrl = getCanonicalBaseUrl(req);
    if (!baseUrl) return json({ ok: false, error: "missing_base_url" }, 500);

    // ⚠️ Aqui está o ponto do teu “testar o prompt do cliente no meu número”
    // O webhook recebe o remoteJid (número do cidadão). O client_id deve ser resolvido por:
    // - instância (TrataTudo bot vs client-6), OU
    // - tabela de "hub numbers -> client_id", OU
    // - override de teste (ver nota em baixo)
    //
    // Por agora mantém simples: se vier client_id, usa; senão fallback.
    const client_id = Number(payload?.client_id || payload?.data?.client_id || 1);

    // 1) gerar reply no teu bot
    const botUrl = `${baseUrl}/api/bot/reply`;
    const apiKey = safeStr(process.env.TRATATUDO_API_KEY);

    const botRes = await fetch(botUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { "X-TrataTudo-Key": apiKey } : {}),
      },
      body: JSON.stringify({
        client_id,
        phone_e164,
        push_name: pushName || undefined,
        text,
        instance_name: instance || undefined,
        source: "webhook:evolution",
      }),
    });

    const botRaw = await botRes.text();
    let botJson: any = null;
    try {
      botJson = JSON.parse(botRaw);
    } catch {
      botJson = null;
    }

    if (!botRes.ok || !botJson?.ok) {
      return json({
        ok: true,
        handled: false,
        reason: "bot_no_reply",
        client_id,
        phone_e164,
        bot_status: botRes.status,
        bot_ok: Boolean(botJson?.ok),
        bot_raw_preview: botRaw.slice(0, 240),
        bot_url_used: botUrl,
      });
    }

    const reply = safeStr(botJson?.data?.reply);
    if (!reply) {
      return json({
        ok: true,
        handled: false,
        reason: "empty_reply",
        client_id,
        phone_e164,
      });
    }

    // 2) enviar reply pelo Evolution (isto é o que te falta agora)
    const send = await sendTextViaEvolution(instance, phone_e164, reply);

    return json({
      ok: true,
      handled: true,
      client_id,
      phone_e164,
      reply_preview: reply.slice(0, 180),
      evolution_send_ok: send.ok,
      evolution_status: send.status,
      evolution_raw_preview: send.raw,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "internal_error" }, 500);
  }
}