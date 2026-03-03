import { NextResponse } from "next/server";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createSbAdmin(url, key, { auth: { persistSession: false } });
}

function cleanText(s: any) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function jidToNumber(jid: string) {
  // "3519xxxxxxx@s.whatsapp.net" -> "3519xxxxxxx"
  if (!jid) return "";
  const m = jid.match(/^(\d+)@/);
  return m ? m[1] : jid.replace(/\D/g, "");
}

function normalizeNumberDigits(n: string) {
  // Evolution aceita com ou sem +, mas mais seguro mandar só dígitos
  return String(n || "").replace(/\D/g, "");
}

function pickFirstString(...vals: any[]) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Webhook handler (Evolution API)
 * - identifica instance_name
 * - identifica phone_e164 (remetente)
 * - identifica texto recebido
 * - resolve client_id pela instância ativa (public.client_instances)
 * - chama /api/bot/reply (motor com estado)
 * - envia reply via Evolution /message/sendText/{instance}
 */
export async function POST(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    const payload = await req.json().catch(() => ({}));

    // ⚠️ Evolution envia formatos diferentes conforme connector/evento.
    // Vamos tentar apanhar instance de vários sítios:
    const instanceName = pickFirstString(
      payload?.instance,
      payload?.instanceName,
      payload?.data?.instance,
      payload?.data?.instanceName,
      payload?.body?.instance,
      payload?.body?.instanceName,
      payload?.qrcode?.instance
    );

    // Texto da mensagem (vários formatos possíveis)
    const text = cleanText(
      pickFirstString(
        payload?.data?.message?.conversation,
        payload?.data?.message?.extendedTextMessage?.text,
        payload?.data?.message?.text,
        payload?.message?.conversation,
        payload?.message?.extendedTextMessage?.text,
        payload?.text,
        payload?.data?.text
      )
    );

    // Remetente (JID ou número)
    const remoteJid = pickFirstString(
      payload?.data?.key?.remoteJid,
      payload?.key?.remoteJid,
      payload?.data?.remoteJid,
      payload?.remoteJid,
      payload?.data?.from,
      payload?.from
    );

    const fromNumber = normalizeNumberDigits(
      pickFirstString(
        payload?.data?.number,
        payload?.number,
        payload?.data?.sender,
        payload?.sender,
        jidToNumber(remoteJid)
      )
    );

    // ignorar eventos sem mensagem de texto
    if (!instanceName || !fromNumber || !text) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // 1) resolver client_id pela instância ativa
    const { data: ci, error: ciErr } = await supabase
      .from("client_instances")
      .select("client_id, instance_name, status")
      .eq("instance_name", instanceName)
      .eq("status", "active")
      .maybeSingle();

    if (ciErr) throw ciErr;
    if (!ci?.client_id) {
      // se não encontrou cliente para a instância, não envia nada
      return NextResponse.json({ ok: true, ignored: true, reason: "unknown_instance" });
    }

    const client_id = Number(ci.client_id);

    // 2) chamar o motor do bot (estado + flows)
    const origin = new URL(req.url).origin;
    const botRes = await fetch(`${origin}/api/bot/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // o bot/reply está protegido por ADMIN_API_KEY (X-TrataTudo-Key)
        "X-TrataTudo-Key": process.env.ADMIN_API_KEY || "",
      },
      body: JSON.stringify({
        client_id,
        phone_e164: `+${fromNumber}`, // guardamos com +
        text,
        channel: "whatsapp",
        instance_name: instanceName,
      }),
    });

    const botJson = await botRes.json().catch(() => ({}));
    const reply = cleanText(botJson?.reply);

    if (!reply) {
      return NextResponse.json({ ok: true, ignored: true, reason: "no_reply" });
    }

    // 3) enviar reply via Evolution
    const evoBase = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
    const evoKey = process.env.EVOLUTION_API_KEY || "";

    if (!evoBase || !evoKey) {
      // sem config de Evolution no Vercel, não dá para enviar
      return NextResponse.json({ ok: false, error: "Missing EVOLUTION_API_URL/EVOLUTION_API_KEY" }, { status: 500 });
    }

    // endpoint padrão Evolution v2: POST /message/sendText/{instance}
    const sendUrl = `${evoBase}/message/sendText/${encodeURIComponent(instanceName)}`;

    const sendRes = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // header usado na doc: apikey
        apikey: evoKey,
      } as any,
      body: JSON.stringify({
        number: fromNumber,
        text: reply,
      }),
    });

    // não bloqueia a UX se o Evolution falhar, mas devolve info
    const sendOk = sendRes.ok;
    const sendBody = await sendRes.text().catch(() => "");

    return NextResponse.json({
      ok: true,
      client_id,
      instance: instanceName,
      from: fromNumber,
      sent: sendOk,
      evolution_status: sendRes.status,
      evolution_body: sendBody ? sendBody.slice(0, 500) : "",
    });
  } catch (e: any) {
    console.error("EVOLUTION WEBHOOK ERROR:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}