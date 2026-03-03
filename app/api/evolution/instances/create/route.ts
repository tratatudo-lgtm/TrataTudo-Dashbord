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

async function evoFetchInstances(evoUrl: string, evoKey: string) {
  const resp = await fetch(`${evoUrl}/instance/fetchInstances`, { headers: { apikey: evoKey } });
  const data = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(`Evolution fetchInstances failed: ${resp.status} ${JSON.stringify(data)}`);
  if (!Array.isArray(data)) throw new Error("Evolution fetchInstances: resposta inválida (não é array)");
  return data;
}

async function evoCreateInstance(evoUrl: string, evoKey: string, name: string, integration: string) {
  const resp = await fetch(`${evoUrl}/instance/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: evoKey },
    body: JSON.stringify({ name, integration }),
  });

  const data = await resp.json().catch(() => null);

  if (!resp.ok) {
    return { ok: false as const, status: resp.status, data };
  }
  return { ok: true as const, status: resp.status, data };
}

export async function POST(request: Request) {
  try {
    // 🔐 proteção
    const apiKey = request.headers.get("x-tratatudo-key") || "";
    const expected = process.env.ADMIN_API_KEY || "";
    if (!expected || apiKey !== expected) return unauthorized();

    const body = await request.json();
    const client_id = Number(body.client_id);
    const target = String(body.target || "trial").toLowerCase(); // "trial" | "production" (opcional)

    if (!client_id) return bad("client_id é obrigatório");

    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) return bad("Evolution API não configurada", 500);

    const supabase = getSupabaseAdmin();

    // valida se o cliente existe
    const { data: clientRow, error: clientErr } = await supabase
      .from("clients")
      .select("id, company_name")
      .eq("id", client_id)
      .single();

    if (clientErr) throw clientErr;
    if (!clientRow) return bad("Cliente não encontrado", 404);

    const instance_name = `client-${client_id}`;
    const integration = "WHATSAPP-BAILEYS";

    // 1) garante que instância existe na Evolution
    const instances = await evoFetchInstances(evoUrl, evoKey);
    const already = instances.find((i: any) => String(i?.name) === instance_name);

    if (!already) {
      const created = await evoCreateInstance(evoUrl, evoKey, instance_name, integration);
      if (!created.ok) {
        // devolve o erro original (ex: Invalid integration)
        return NextResponse.json(
          {
            ok: false,
            error: `Não consegui criar/encontrar instância "${instance_name}".`,
            create: created.status,
            details: created.data,
          },
          { status: 500 }
        );
      }
    }

    // 2) no Supabase: desativa instâncias anteriores do cliente
    await supabase
      .from("client_instances")
      .update({ status: "inactive" })
      .eq("client_id", client_id)
      .eq("status", "active");

    // 3) cria registo active para a nova instância
    const { error: insErr } = await supabase.from("client_instances").insert([
      {
        client_id,
        instance_name,
        status: "active",
        is_hub: false,
      },
    ]);

    if (insErr) throw insErr;

    // 4) atualiza clients.instance_name (e production_instance_name se quiseres)
    const patch: any = { instance_name };

    if (target === "production") {
      patch.production_instance_name = instance_name;
    }

    const { error: updClientErr } = await supabase.from("clients").update(patch).eq("id", client_id);
    if (updClientErr) throw updClientErr;

    return NextResponse.json({
      ok: true,
      client_id,
      instance_name,
      integration,
      target,
    });
  } catch (error: any) {
    console.error("Create instance error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}