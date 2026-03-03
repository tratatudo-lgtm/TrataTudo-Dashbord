import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const client_id = Number(body.client_id);
    const instance_name = String(body.instance_name || "").trim();

    if (!client_id || !instance_name) {
      return NextResponse.json(
        { ok: false, error: "client_id e instance_name são obrigatórios" },
        { status: 400 }
      );
    }

    // desativa todas
    const { error: offErr } = await supabase
      .from("client_instances")
      .update({ status: "inactive" })
      .eq("client_id", client_id);

    if (offErr) throw offErr;

    // ativa ou cria
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
        .insert([{
          client_id,
          instance_name,
          is_hub: false,
          status: "active"
        }]);

      if (insErr) throw insErr;
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Switch instance error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}