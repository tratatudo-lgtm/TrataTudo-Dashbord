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

function normalizePriority(p: any): "low" | "medium" | "high" {
  const v = String(p || "").toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function normalizeStatus(s: any): string {
  const v = String(s || "").toLowerCase().trim();
  // usa os que a tua dashboard vai usar
  const allowed = new Set(["new", "triage", "in_progress", "waiting_user", "done", "cancelled"]);
  return allowed.has(v) ? v : "new";
}

function makeTracking(prefix = "TT") {
  // 6 chars, uppercase
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `${prefix}-${rand.slice(0, 6)}`;
}

export async function POST(request: Request) {
  try {
    // 🔐 proteção (igual ao que já estás a usar)
    const apiKey = request.headers.get("x-tratatudo-key") || "";
    const expected = process.env.ADMIN_API_KEY || "";
    if (!expected || apiKey !== expected) return unauthorized();

    const supabase = getSupabaseAdmin();

    const body = await request.json().catch(() => ({}));
    const client_id = Number(body.client_id);

    // "report" vem do bot (o objeto já estruturado)
    const report = body.report || {};
    const message = String(body.message || "").trim();

    if (!client_id) return bad("client_id é obrigatório");

    // valida que o cliente existe (evita lixo)
    const { data: clientRow, error: cErr } = await supabase
      .from("clients")
      .select("id, company_name")
      .eq("id", client_id)
      .single();

    if (cErr) throw cErr;
    if (!clientRow) return bad("Cliente não encontrado", 404);

    // 📌 mapear para a tua tabela public.tickets
    // kind: complaint / request / info
    const kind = String(report.type || report.kind || "complaint");

    const category = report.category ? String(report.category) : null;
    const priority = normalizePriority(report.urgency || report.priority);
    const status = normalizeStatus(report.status);

    const location_text = report.location_text ? String(report.location_text) : null;

    // subject pode vir vazio → tenta construir algo curto
    const subject =
      report.subject
        ? String(report.subject)
        : category
        ? `${kind}: ${category}`
        : `${kind}`;

    // description: usa report.description senão message
    const description = report.description ? String(report.description) : (message || null);

    const customer_name = report.citizen_name ? String(report.citizen_name) : null;
    const customer_contact = report.citizen_contact ? String(report.citizen_contact) : null;

    const channel = report.channel ? String(report.channel) : "whatsapp";

    // tracking_code: tenta gerar com retry se colidir
    const prefix = "TT";
    let tracking_code = makeTracking(prefix);

    let insertData: any = {
      client_id,
      tracking_code,
      kind,
      category,
      subject,
      description,
      priority,
      status,
      customer_name,
      customer_contact,
      location_text,
      channel,
      metadata: report.metadata || {},
      raw: report || {},
    };

    // tenta até 5 vezes em caso de colisão (muito raro)
    let lastErr: any = null;
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabase
        .from("tickets")
        .insert([insertData])
        .select("id, tracking_code, status, created_at")
        .single();

      if (!error) {
        return NextResponse.json({
          ok: true,
          ticket_id: data.id,
          tracking_code: data.tracking_code,
          status: data.status,
          created_at: data.created_at,
        });
      }

      lastErr = error;

      // unique violation (tracking_code)
      if (error.code === "23505") {
        tracking_code = makeTracking(prefix);
        insertData.tracking_code = tracking_code;
        continue;
      }

      throw error;
    }

    console.error("Tickets insert failed after retries:", lastErr);
    return bad("Falha ao criar ticket (tracking_code collision)", 500);
  } catch (error: any) {
    console.error("API Reports POST Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}