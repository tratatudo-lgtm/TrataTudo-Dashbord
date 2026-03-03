import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars (URL or SERVICE_ROLE_KEY).");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * GET /api/messages
 * Query params:
 *  - phone: string (optional) -> filters by phone_e164
 *  - instance: string (optional)
 *  - limit: number (optional, default 200, max 500)
 */
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone");
    const instance = searchParams.get("instance");

    const limitRaw = Number(searchParams.get("limit") || "200");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    let q = supabase
      .from("wa_messages")
      .select("id, phone_e164, instance, direction, text, raw, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (phone) q = q.eq("phone_e164", phone);
    if (instance) q = q.eq("instance", instance);

    const { data, error } = await q;

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: (error as any).code ?? null },
        { status: 500 }
      );
    }

    // Compat: se a UI espera "phone", mapeamos aqui.
    const mapped = (data || []).map((m: any) => ({
      id: m.id,
      phone: m.phone_e164,
      phone_e164: m.phone_e164,
      instance: m.instance,
      direction: m.direction,
      text: m.text,
      raw: m.raw,
      created_at: m.created_at,
    }));

    return NextResponse.json({ ok: true, data: mapped });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}