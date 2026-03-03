// app/api/diagnostics/env/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type EnvMap = Record<string, boolean>;

const REQUIRED_ENVS = [
  // Supabase
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",

  // Evolution
  "EVOLUTION_API_URL",
  "EVOLUTION_API_KEY",

  // Groq
  "GROQ_API_KEY",
  "GROQ_MODEL",

  // URLs
  "NEXT_PUBLIC_SITE_URL",
  "APP_URL",
] as const;

function hasValue(v: string | undefined | null) {
  return typeof v === "string" && v.trim().length > 0;
}

export async function GET() {
  try {
    const values: EnvMap = {};
    for (const key of REQUIRED_ENVS) {
      values[key] = hasValue(process.env[key]);
    }

    const missing = Object.entries(values)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);

    return NextResponse.json(
      {
        ok: true,
        service: "tratatudo-dashboard",
        ts: new Date().toISOString(),
        values,
        missing,
      },
      { status: 200 }
    );
  } catch (err: any) {
    // NUNCA devolve HTML — sempre JSON
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || "Erro interno ao validar envs",
        ts: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}