import { NextResponse } from "next/server";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env vars.");
  return createSbAdmin(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  try {
    // 🔐 proteção (por enquanto, para não expor dados publicamente)
    const apiKey = request.headers.get("x-tratatudo-key") || "";
    const expected = process.env.ADMIN_API_KEY || "";
    if (!expected || apiKey !== expected) return unauthorized();

    const { searchParams } = new URL(request.url);
    const code = String(searchParams.get("code") || "").trim();
    const client_id = Number(searchParams.get("client_id") || "");

    if (!code) return bad("code é obrigatório (ex: TT-ABC123)");
    if (!client_id) return bad("client_id é obrigatório");

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("tickets")
      .select("tracking_code, status, category, priority, subject, created_at, updated_at")
      .eq("client_id", client_id)
      .eq("tracking_code", code)
      .single();

    if (error) {
      // not found
      if (error.code === "PGRST116") {
        return NextResponse.json({ ok: true, found: false, code }, { status: 200 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, found: true, ...data });
  } catch (error: any) {
    console.error("API Reports Status GET Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}