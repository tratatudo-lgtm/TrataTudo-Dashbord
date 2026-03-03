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

export async function POST(request: Request) {
  try {
    // 🔐 proteção
    const apiKey = request.headers.get("x-tratatudo-key") || "";
    const expected = process.env.ADMIN_API_KEY || "";
    if (!expected || apiKey !== expected) return unauthorized();

    const body = await request.json();
    const client_id = Number(body.client_id);
    if (!client_id) return bad("client_id é obrigatório");

    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) return bad("Evolution API não configurada", 500);

    // 1) instância active do cliente
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

    // 2) buscar status na Evolution
    const listResp = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey }
    });

    const instances = await listResp.json();

    if (!Array.isArray(instances)) {
      return bad("Resposta inválida da Evolution (não é array)", 500);
    }

    const inst = instances.find((i: any) => String(i?.name) === instanceName);

    if (!inst) {
      return NextResponse.json({
        ok: true,
        client_id,
        instance_name: instanceName,
        found: false
      });
    }

    return NextResponse.json({
      ok: true,
      client_id,
      instance_name: instanceName,
      found: true,
      connectionStatus: inst.connectionStatus ?? null,
      number: inst.number ?? null,
      ownerJid: inst.ownerJid ?? null,
      profileName: inst.profileName ?? null,
      profilePicUrl: inst.profilePicUrl ?? null,
      integration: inst.integration ?? null,
      updatedAt: inst.updatedAt ?? null
    });
  } catch (error: any) {
    console.error("Instance status error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}