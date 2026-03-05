import { NextResponse } from "next/server";

/**
 * Webhook da Evolution API (via relay).
 * Recebe eventos e, quando for uma mensagem inbound (fromMe=false),
 * chama o motor do bot em /api/bot/reply no DOMÍNIO CANÓNICO.
 *
 * ENV:
 * - TRATATUDO_RELAY_SECRET  (obrigatório)
 * - APP_BASE_URL            (recomendado) ex: https://trata-tudo-dashbord.vercel.app
 * - TRATATUDO_API_KEY       (opcional, se /api/bot/reply precisar)
 */

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
  // fallback seguro, caso APP_BASE_URL não exista
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "";
  return `${proto}://${host}`;
}

function getCanonicalBaseUrl(req: Request) {
  const envBase = safeStr(process.env.APP_BASE_URL);
  if (envBase) return envBase.replace(/\/+$/, ""); // remove trailing slash
  const reqBase = getBaseUrlFromRequest(req);
  return reqBase.replace(/\/+$/, "");
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

export async function POST(req: Request) {
  try {
    // 1) validar segredo do relay (?s=...)
    const v = validateRelaySecret(req);
    if (!v.ok) return json({ ok: false, error: v.error }, 401);

    const payload = await req.json().catch(() => null);
    if (!payload) return json({ ok: false, error: "invalid_json" }, 400);

    const event = safeStr(payload.event);
    const instance = safeStr(payload.instance);
    const data = payload.data || {};
    const pushName = safeStr(data.pushName || payload.pushName || "");

    // Apenas mensagens inbound:
    // event: messages.upsert
    // data.key.fromMe === false
    const fromMe = Boolean(data?.key?.fromMe);
    if (event !== "messages.upsert" || fromMe) {
      return json({ ok: true, ignored: true, reason: "not_inbound_message" });
    }

    const remoteJid = safeStr(data?.key?.remoteJid);
    const phone_e164 = normalizeE164FromRemoteJid(remoteJid);

    // Extrair texto (suporta conversation e extendedTextMessage)
    const text =
      safeStr(data?.message?.conversation) ||
      safeStr(data?.message?.extendedTextMessage?.text) ||
      safeStr(data?.message?.imageMessage?.caption) ||
      "";

    if (!phone_e164 || !text) {
      return json({
        ok: true,
        handled: false,
        reason: "missing_phone_or_text",
        phone_e164,
      });
    }

    /**
     * ⚠️ Aqui está a parte crítica:
     * chamamos SEMPRE o bot no domínio canónico (APP_BASE_URL),
     * e nunca em URLs de preview/deployment.
     */
    const baseUrl = getCanonicalBaseUrl(req);
    if (!baseUrl) {
      return json({ ok: false, error: "missing_base_url" }, 500);
    }

    const botUrl = `${baseUrl}/api/bot/reply`;

    // Determinar client_id:
    // - Se já envias client_id no webhook, usa-o
    // - Senão, usa o 1 por defeito (ajusta se quiseres mapear por instance/numero)
    const client_id = Number(payload?.client_id || data?.client_id || 1);

    // Se /api/bot/reply exigir API key server-to-server, manda-a.
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
        // podes enviar também instance se quiseres usar no /api/bot/reply
        instance_name: instance || undefined,
        source: "webhook:evolution",
      }),
    });

    const botRaw = await botRes.text();
    const botRawPreview = botRaw.slice(0, 240);

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
        bot_raw_preview: botRawPreview,
        bot_url_used: botUrl,
      });
    }

    // Se o bot respondeu, consideramos handled.
    return json({
      ok: true,
      handled: true,
      client_id,
      phone_e164,
      reply_preview: safeStr(botJson?.data?.reply).slice(0, 180),
      bot_url_used: botUrl,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "internal_error" }, 500);
  }
}