import { NextResponse } from "next/server";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

const PREFIX = "client-";
const DEFAULT_INTEGRATION = "WHATSAPP-BAILEYS";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE env vars.");
  return createSbAdmin(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-tratatudo-key") || "";
    const expected = process.env.ADMIN_API_KEY || "";
    if (!expected || apiKey !== expected) return unauthorized();

    const body = await request.json();
    const client_id = Number(body.client_id);
    if (!client_id) return bad("client_id é obrigatório");

    const instance_name = `${PREFIX}${client_id}`;

    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) return bad("Evolution API não configurada", 500);

    // 1) Criar instância na Evolution (com integração correta)
    const createResp = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey
      },
      body: JSON.stringify({
        instanceName: instance_name,
        integration: DEFAULT_INTEGRATION
      })
    });

    // 2) Confirmar que existe
    const listResp = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey }
    });

    const instances = await listResp.json();
    const exists =
      Array.isArray(instances) &&
      instances.some((i: any) => String(i?.name) === instance_name);

    if (!exists) {
      const txt = await createResp.text().catch(() => "");
      return bad(
        `Não consegui criar/encontrar instância "${instance_name}". create=${createResp.status} ${txt?.slice(0, 300)}`,
        500
      );
    }

    // 3) Switch no Supabase
    const supabase = getSupabaseAdmin();

    await supabase
      .from("client_instances")
      .update({ status: "inactive" })
      .eq("client_id", client_id);

    const { data: existing, error: exErr } = await supabase
      .from("client_instances")
      .select("id")
      .eq("client_id", client_id)
      .eq("instance_name", instance_name)
      .limit(1)
      .maybeSingle();

    if (exErr) throw exErr;

    if (existing?.id) {
      const { error: onErr } = await supabase
        .from("client_instances")
        .update({ status: "active" })
        .eq("id", existing.id);

      if (onErr) throw onErr;
    } else {
      const { error: insErr } = await supabase
        .from("client_instances")
        .insert([{ client_id, instance_name, is_hub: false, status: "active" }]);

      if (insErr) throw insErr;
    }

    return NextResponse.json({ ok: true, client_id, instance_name, integration: DEFAULT_INTEGRATION });
  } catch (error: any) {
    console.error("Create instance error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}