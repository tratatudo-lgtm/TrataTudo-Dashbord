import { NextResponse } from "next/server";
import { createClient as createSbServer } from "@/lib/supabase/server";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

const DEFAULT_PREFIX = "client-";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env vars.");
  return createSbAdmin(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    // só admin logado pode ativar
    const supabaseSession = createSbServer();
    const { data: { session } } = await supabaseSession.auth.getSession();
    if (!session) return bad("Não autorizado", 401);

    const body = await request.json();
    const client_id = Number(body.client_id);
    if (!client_id) return bad("client_id é obrigatório");

    const instance_name = `${DEFAULT_PREFIX}${client_id}`;

    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;
    if (!evoUrl || !evoKey) return bad("Evolution API não configurada", 500);

    // 1) Criar instância na Evolution (se já existir, vamos tratar mais abaixo)
    // Endpoints da Evolution podem variar, mas na v2.x normalmente:
    // POST /instance/create
    // body: { instanceName: "client-6", token: "...?" }
    // Vamos tentar o create e, se falhar porque existe, seguimos.
    const createResp = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({ instanceName: instance_name })
    });

    // Se não for ok, pode ser "já existe" ou endpoint diferente.
    // Vamos tentar ler lista e confirmar se aparece.
    const listResp = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { apikey: evoKey }
    });
    const instances = await listResp.json();

    const exists = Array.isArray(instances) && instances.some((i: any) => String(i?.name) === instance_name);
    if (!exists) {
      // Se não criou e não existe, devolvemos erro com info para ajustar endpoint
      const createText = await createResp.text().catch(() => "");
      return bad(
        `Não consegui criar/encontrar a instância "${instance_name}" na Evolution. ` +
        `Resposta create: ${createResp.status} ${createText?.slice(0, 200)}`,
        500
      );
    }

    // 2) Switch no Supabase: deixar só esta como active
    const sbAdmin = getSupabaseAdmin();

    await sbAdmin
      .from("client_instances")
      .update({ status: "inactive" })
      .eq("client_id", client_id);

    // se já existe no Supabase, ativa; senão cria
    const { data: existing } = await sbAdmin
      .from("client_instances")
      .select("id")
      .eq("client_id", client_id)
      .eq("instance_name", instance_name)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await sbAdmin
        .from("client_instances")
        .update({ status: "active" })
        .eq("id", existing.id);
    } else {
      await sbAdmin
        .from("client_instances")
        .insert([{ client_id, instance_name, is_hub: false, status: "active" }]);
    }

    return NextResponse.json({ ok: true, client_id, instance_name });
  } catch (e: any) {
    console.error("Activate instance error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}