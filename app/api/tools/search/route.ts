// app/api/tools/search/route.ts
import { NextResponse } from "next/server";
import { searxngSearch } from "@/lib/web/search";

export const runtime = "nodejs";

function parseDomains(v: string | null) {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getParams(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get("q") || "";
  const n = Number(u.searchParams.get("n") || "5") || 5;
  const domains = parseDomains(u.searchParams.get("domains"));
  return { q, n, domains };
}

export async function GET(req: Request) {
  try {
    const { q, n, domains } = getParams(req);
    const results = await searxngSearch(q, n, domains);
    return NextResponse.json({ ok: true, query: q, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // também aceita body JSON opcional: { q, n, domains }
  try {
    let q = "";
    let n = 5;
    let domains: string[] = [];

    // 1) tenta body
    try {
      const body = await req.json();
      q = String(body?.q || "");
      n = Number(body?.n || 5) || 5;
      domains = Array.isArray(body?.domains) ? body.domains.map(String) : [];
    } catch {
      // ignora
    }

    // 2) override por querystring se existir
    const qp = getParams(req);
    if (qp.q) q = qp.q;
    if (qp.n) n = qp.n;
    if (qp.domains.length > 0) domains = qp.domains;

    const results = await searxngSearch(q, n, domains);
    return NextResponse.json({ ok: true, query: q, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}