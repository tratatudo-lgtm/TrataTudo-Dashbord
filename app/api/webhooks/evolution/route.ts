import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeStr(v: any) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeE164FromRemoteJid(remoteJid: string) {
  // Ex: "351937230116@s.whatsapp.net" -> "+351937230116"
  const n = safeStr(remoteJid).split("@")[0].replace(/[^\d]/g, "");
  return n ? `+${n}` : "";
}

function isTruthy(v: any) {
  const s = String(v ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

async function callBotReply(opts: {
  baseUrl: string;
  apiKey: string;
  client_id: number;
  phone_e164: string;
  push_name: string;
  text: string;
}) {
  const res = await fetch(`${opts.baseUrl}/api/bot/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TrataTudo-Key": opts.apiKey,
    },
    body: JSON.stringify({
      client_id: opts.client_id,
      phone_e164: opts.phone_e164,
      push_name: opts.push_name,
      text: opts.text,
    }),
  });

  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // ignore
  }

  return { ok: res.ok, status: res.status, raw, json };
}

async function sendEvolutionText(opts: {
  evoUrl: string;
  evoKey: string;
  instance: string;
  phone_e164: string;
  text: string;
}) {
  // Evolution costuma querer number sem "+" (depende config). Vamos mandar sem "+" por segurança.
  const number = opts.phone_e164.replace("+", "");

  const url = `${opts.evoUrl}/message/sendText/${encodeURIComponent(opts.instance)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: opts.evoKey,
    },
    body: JSON.stringify({ number, text: opts.text }),
  });

  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    // ignore
  }

  return { ok: res.ok, status: res.status, raw, json };
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);

    // Secret via query ?s=...
    const secret = safeStr(url.searchParams.get("s"));
    const expectedSecret = safeStr(process.env.TRATATUDO_RELAY_SECRET || "");
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "invalid_secret" }, { status: 403 });
    }

    const body = await req.json();

    const event = safeStr(body?.event);
    const instance = safeStr(body?.instance);
    const data = body?.data ?? {};
    const key = data?.key ?? {};
    const remoteJid = safeStr(key?.remoteJid);
    const fromMe = !!key?.fromMe;

    // Só tratamos inbound
    if (fromMe) {
      return NextResponse.json({ ok: true, ignored: true, reason: "from_me" });
    }

    // Só tratamos mensagens
    if (event !== "messages.upsert") {
      return NextResponse.json({ ok: true, ignored: true, reason: "event_not_handled", event });
    }

    const phone_e164 = normalizeE164FromRemoteJid(remoteJid);
    const push_name = safeStr(data?.pushName || "");
    const text =
      safeStr(data?.message?.conversation) ||
      safeStr(data?.message?.extendedTextMessage?.text) ||
      safeStr(data?.message?.imageMessage?.caption) ||
      "";

    if (!instance || !phone_e164 || !text) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: "missing_fields",
        instance,
        phone_e164,
        has_text: !!text,
      });
    }

    const supabase = createClient();

    // 1) Resolver client_id: prioridade (client_instances -> clients.phone -> clients.instance)
    let client_id: number | null = null;

    // 1.1) client_instances (se existir)
    {
      const { data: rows } = await supabase
        .from("client_instances")
        .select("client_id, active, phone_e164")
        .eq("phone_e164", phone_e164)
        .order("updated_at", { ascending: false })
        .limit(1);

      const r = Array.isArray(rows) ? rows[0] : null;
      if (r?.client_id && (r?.active === true || isTruthy(r?.active))) {
        client_id = Number(r.client_id);
      }
    }

    // 1.2) clients.phone_e164
    if (!client_id) {
      const { data: c } = await supabase
        .from("clients")
        .select("id")
        .eq("phone_e164", phone_e164)
        .order("updated_at", { ascending: false })
        .limit(1);

      const r = Array.isArray(c) ? c[0] : null;
      if (r?.id) client_id = Number(r.id);
    }

    // 1.3) fallback por instance (HUB)
    if (!client_id) {
      const { data: c } = await supabase
        .from("clients")
        .select("id")
        .eq("instance_name", instance)
        .order("updated_at", { ascending: false })
        .limit(1);

      const r = Array.isArray(c) ? c[0] : null;
      if (r?.id) client_id = Number(r.id);
    }

    if (!client_id) {
      return NextResponse.json({ ok: true, handled: false, reason: "client_not_found", phone_e164, instance });
    }

    // 2) Chamar bot/reply (server-to-server)
    const baseUrl =
      safeStr(process.env.NEXT_PUBLIC_SITE_URL) ||
      safeStr(process.env.SITE_URL) ||
      "https://trata-tudo-dashbord.vercel.app";

    const tratatudoKey = safeStr(process.env.TRATATUDO_API_KEY || "");
    if (!tratatudoKey) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: "missing_env_TRATATUDO_API_KEY",
        client_id,
        phone_e164,
      });
    }

    const bot = await callBotReply({
      baseUrl,
      apiKey: tratatudoKey,
      client_id,
      phone_e164,
      push_name,
      text,
    });

    const reply = safeStr(bot?.json?.data?.reply);

    if (!bot.ok || !reply) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: "bot_no_reply",
        client_id,
        phone_e164,
        bot_status: bot.status,
        bot_ok: bot.ok,
        bot_raw_preview: safeStr(bot.raw).slice(0, 300),
      });
    }

    // 3) Enviar resposta no Evolution pela MESMA instância que recebeu (HUB)
    const evoUrl = safeStr(process.env.EVOLUTION_API_URL || process.env.EVO_URL || "");
    const evoKey = safeStr(process.env.EVOLUTION_API_KEY || process.env.EVO_KEY || "");
    if (!evoUrl || !evoKey) {
      return NextResponse.json({
        ok: true,
        handled: false,
        reason: "missing_env_EVO",
        client_id,
        phone_e164,
        has_evoUrl: !!evoUrl,
        has_evoKey: !!evoKey,
      });
    }

    const sent = await sendEvolutionText({
      evoUrl,
      evoKey,
      instance, // IMPORTANTE: responde pela mesma instância
      phone_e164,
      text: reply,
    });

    return NextResponse.json({
      ok: true,
      handled: true,
      client_id,
      phone_e164,
      sent_ok: sent.ok,
      sent_status: sent.status,
    });
  } catch (err: any) {
    console.error("webhooks/evolution error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "internal_error" }, { status: 500 });
  }
}