import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function requireKey(req: Request) {
  const got = req.headers.get("x-tratatudo-key") || "";
  const expected = process.env.ADMIN_API_KEY || "";
  return expected && got === expected;
}

export async function GET(req: Request) {
  try {
    if (!requireKey(req)) {
      return NextResponse.json({ ok: false, error: "Não autorizado" }, { status: 401 });
    }

    const supabase = createClient();

    const [{ count: totalClients, error: e1 }, { count: totalTickets, error: e2 }, { count: totalMsgs, error: e3 }] =
      await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("tickets").select("*", { count: "exact", head: true }),
        supabase.from("wa_messages").select("*", { count: "exact", head: true }),
      ]);

    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;

    return NextResponse.json({
      ok: true,
      data: {
        totalClients: totalClients || 0,
        totalTickets: totalTickets || 0,
        totalMessages: totalMsgs || 0,
      },
    });
  } catch (err: any) {
    console.error("Stats Public API Error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Erro interno" }, { status: 500 });
  }
}