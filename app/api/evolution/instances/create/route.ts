import { NextResponse } from "next/server";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

const PREFIX = "client-";

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE env vars.");
  }

  return createSbAdmin(url, key, {
    auth: { persistSession: false }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const client_id = Number(body.client_id);

    if (!client_id) {
      return bad("client_id é obrigatório");
    }

    const instance_name = `${PREFIX}${client_id}`;

    const evoUrl = process.env.EVOLUTION_API_URL;
    const evoKey = process.env.EVOLUTION_API_KEY;

    if (!evoUrl || !evoKey) {
      return bad("Evolution API não configurada", 500);
    }

    // 1️⃣ Criar instância na Evolution
    const createResp = await fetch(`${evoUrl}/instance/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evoKey
      },
      body: JSON.stringify({
        instanceName: instance_name
      })
    });

    // 2️⃣ Confirmar se existe (caso já exista não falha)
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
        `Não consegui criar/encontrar instância. ${createResp.status} ${txt}`,
        500
      );
    }

    // 3️⃣ Switch no Supabase
    const supabase = getSupabaseAdmin();

    // desativa todas do cliente
    await supabase
      .from("client_instances")
      .update({ status: "inactive" })
      .eq("client_id", client_id);

    // verifica se já existe no Supabase
    const { data: existing } = await supabase
      .from("client_instances")
      .select("id")
      .eq("client_id", client_id)
      .eq("instance_name", instance_name)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from("client_instances")
        .update({ status: "active" })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("client_instances")
        .insert([
          {
            client_id,
            instance_name,
            is_hub: false,
            status: "active"
          }
        ]);
    }

    return NextResponse.json({
      ok: true,
      client_id,
      instance_name
    });
  } catch (error: any) {
    console.error("Create instance error:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}