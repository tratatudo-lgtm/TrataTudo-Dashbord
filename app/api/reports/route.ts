import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase admin env vars.");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const apiKey = request.headers.get("x-tratatudo-key") || "";
    const expected = process.env.REPORTS_API_KEY || "";

    if (!expected || apiKey !== expected) {
      return unauthorized();
    }

    const body = await request.json();
    const { client_id, report, message } = body || {};

    if (!client_id) return badRequest("client_id é obrigatório");
    if (!report || report.__REPORT__ !== true) return badRequest("report inválido (falta __REPORT__)");

    const supabase = getSupabaseAdmin();

    const type = String(report.type || "").toLowerCase();

    const kind =
      type === "complaint" ? "complaint" :
      type === "service_request" ? "request" :
      (report.kind ? String(report.kind) : "request");

    const category =
      report.category ||
      report.service ||
      report.service_subtype ||
      "Outros";

    const description =
      report.description ||
      report.details ||
      message ||
      "Sem descrição";

    const urgency = String(report.urgency || "").toLowerCase();
    const priority =
      urgency === "high" || urgency === "urgent" ? "high" :
      urgency === "medium" ? "medium" :
      "low";

    const insertTicket = {
      client_id: Number(client_id),
      kind,
      category: String(category),
      subject: report.subject ? String(report.subject) : null,
      description: String(description),
      priority,
      status: "new",
      customer_name: report.citizen_name ? String(report.citizen_name) : null,
      customer_contact: report.citizen_contact ? String(report.citizen_contact) : null,
      location_text: report.location_text ? String(report.location_text) : null,
      channel: report.channel ? String(report.channel) : "whatsapp",
      metadata: (report.metadata && typeof report.metadata === "object") ? report.metadata : {},
      raw: report
    };

    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .insert([insertTicket])
      .select("id")
      .single();

    if (ticketError) throw ticketError;

    if (message) {
      const { error: msgError } = await supabase
        .from("ticket_messages")
        .insert([{
          ticket_id: ticket.id,
          role: "user",
          content: String(message),
          raw: { client_id, report }
        }]);

      if (msgError) throw msgError;
    }

    return NextResponse.json({ ok: true, ticket_id: ticket.id });
  } catch (error: any) {
    console.error("API Reports POST Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}