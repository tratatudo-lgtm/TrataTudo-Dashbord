import { NextResponse } from "next/server";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env vars.");
  return createSbAdmin(url, key, { auth: { persistSession: false } });
}

function digitsOnly(phone: string) {
  return String(phone || "").trim().replace(/\s+/g, "").replace(/[^\d]/g, "");
}

function toPlusE164Digits(phone: string) {
  // devolve string tipo "+3519...." (sem espaços)
  let p = String(phone || "").trim().replace(/\s+/g, "");
  if (!p.startsWith("+")) {
    const d = digitsOnly(p);
    if (d.startsWith("351")) p = "+" + d;
    else p = "+" + d;
  }
  // remove coisas estranhas
  p = p.replace(/[^\d+]/g, "");
  return p;
}

async function evoConnect(evoUrl: string, evoKey: string, instanceName: string, query?: string) {
  const url = query
    ? `${evoUrl}/instance/connect/${encodeURIComponent(instanceName)}?${query}`
    : `${evoUrl}/instance/connect/${encodeURIComponent(instanceName)}`;

  const resp = await fetch(url, { method: "GET", headers: { apikey: evoKey } });
  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    const fallback = await resp.text().catch(() => "");
    return { ok: false, status: resp.status, error: json || fallback, url };
  }

  return { ok: true, data: json, url };
}

export async function POST(request: Request) {
  try {
    // 🔐 proteção
    const apiKey = request.headers.get("x-tratatudo-key") || "";
    const expected = process.env.ADMIN_API_KEY || "";
    if (!expected || apiKey !== expected) return unauthorized();

    const body = await request.json();
    const client_id = Number(body.client_id);
    const mode = String(body.mode || "qr").toLowerCase(); // "qr" | "pairing" | "both"
    const phoneForPairing = body.phone || body.number || body.pairing_number;

    if (!client_id) return bad("client_id é obrigatório");

    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) return bad("Evolution API não configurada", 500);

    // instância active
    const supabase = getSupabaseAdmin();
    const { data: ci, error: ciErr } = await supabase
      .from("client_instances")
      .select("instance_name")
      .eq("client_id", client_id)
      .eq("status", "active")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (ciErr) throw ciErr;

    const instanceName = ci?.instance_name;
    if (!instanceName) return bad("Cliente sem instância active", 404);

    // QR simples
    if (mode === "qr") {
      const qr = await evoConnect(evoUrl, evoKey, instanceName);
      return NextResponse.json({ ok: true, client_id, instance_name: instanceName, qr });
    }

    // Pairing com tentativas de query param (number vs phoneNumber, com/sem +)
    if (mode === "pairing") {
      if (!phoneForPairing) return bad('Para pairing, envia "number" (ex: 3519... ou +3519...)');

      const d = digitsOnly(phoneForPairing);
      const plus = toPlusE164Digits(phoneForPairing);

      const attempts = [
        `number=${encodeURIComponent(d)}`,
        `number=${encodeURIComponent(plus)}`,
        `phoneNumber=${encodeURIComponent(d)}`,
        `phoneNumber=${encodeURIComponent(plus)}`
      ];

      let last: any = null;

      for (const q of attempts) {
        const res = await evoConnect(evoUrl, evoKey, instanceName, q);
        last = res;

        const pairingCode = res.ok ? res.data?.pairingCode : null;
        if (pairingCode) {
          return NextResponse.json({
            ok: true,
            client_id,
            instance_name: instanceName,
            pairingCode,
            usedQuery: q
          });
        }
      }

      // fallback: devolve QR para não bloquear o processo
      // (porque a tua Evolution está a deixar this.phoneNumber vazio)
      const qr = await evoConnect(evoUrl, evoKey, instanceName);
      return NextResponse.json({
        ok: false,
        error: "A Evolution não gerou pairingCode (pairingCode=null). Vou devolver QR como alternativa.",
        client_id,
        instance_name: instanceName,
        tried: attempts,
        last,
        qr
      }, { status: 200 });
    }

    // both
    if (mode === "both") {
      const qr = await evoConnect(evoUrl, evoKey, instanceName);

      let pairing: any = { ok: false, error: 'Falta "number" para pairing' };
      if (phoneForPairing) {
        const d = digitsOnly(phoneForPairing);
        const plus = toPlusE164Digits(phoneForPairing);

        const attempts = [
          `number=${encodeURIComponent(d)}`,
          `number=${encodeURIComponent(plus)}`,
          `phoneNumber=${encodeURIComponent(d)}`,
          `phoneNumber=${encodeURIComponent(plus)}`
        ];

        for (const q of attempts) {
          const res = await evoConnect(evoUrl, evoKey, instanceName, q);
          const pairingCode = res.ok ? res.data?.pairingCode : null;
          if (pairingCode) {
            pairing = { ok: true, pairingCode, usedQuery: q };
            break;
          }
          pairing = { ok: false, tried: attempts, last: res };
        }
      }

      return NextResponse.json({ ok: true, client_id, instance_name: instanceName, qr, pairing });
    }

    return bad('mode inválido. Usa "qr", "pairing" ou "both".');
  } catch (error: any) {
    console.error("Connect instance error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}