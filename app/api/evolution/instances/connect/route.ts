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

function normalizeDigits(phone: string) {
  // Evolution docs: query param number = "Phone number (with country code)"
  // Vamos enviar só dígitos (ex: 3519xxxxxxx).
  return String(phone || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^\d]/g, "");
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

    // 1) buscar instância active do cliente
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

    // 2) chamar Evolution connect
    // docs: GET /instance/connect/{instance} (opcional ?number=...)
    // QR: sem number
    // Pairing: com number=351...
    const results: any = { ok: true, client_id, instance_name: instanceName, mode };

    const doConnect = async (withNumber?: string) => {
      const url =
        withNumber && withNumber.length > 0
          ? `${evoUrl}/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(withNumber)}`
          : `${evoUrl}/instance/connect/${encodeURIComponent(instanceName)}`;

      const resp = await fetch(url, {
        method: "GET",
        headers: { apikey: evoKey }
      });

      const json = await resp.json().catch(() => null);

      if (!resp.ok) {
        return { ok: false, status: resp.status, error: json || (await resp.text().catch(() => "")) };
      }

      return { ok: true, data: json };
    };

    if (mode === "qr") {
      results.qr = await doConnect();
      return NextResponse.json(results);
    }

    if (mode === "pairing") {
      if (!phoneForPairing) return bad("Para pairing, envia phone/number (ex: +3519... ou 3519...)");
      const digits = normalizeDigits(phoneForPairing);
      if (!digits) return bad("Número inválido para pairing");
      results.pairing = await doConnect(digits);
      return NextResponse.json(results);
    }

    // both
    if (mode === "both") {
      results.qr = await doConnect();
      if (phoneForPairing) {
        const digits = normalizeDigits(phoneForPairing);
        results.pairing = digits ? await doConnect(digits) : { ok: false, error: "Número inválido para pairing" };
      } else {
        results.pairing = { ok: false, error: "Falta phone/number para pairing" };
      }
      return NextResponse.json(results);
    }

    return bad('mode inválido. Usa "qr", "pairing" ou "both".');
  } catch (error: any) {
    console.error("Connect instance error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}