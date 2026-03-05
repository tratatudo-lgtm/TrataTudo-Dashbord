import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safe(v: any) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || ''
  const expected = process.env.TRATATUDO_API_KEY || ''
  return expected.length > 0 && key === expected
}

// GET ?client_id=6  -> lista domínios
export async function GET(req: Request) {
  try {
    const supabase = createClient()

    // dashboard: sessão OU server-to-server: api key
    const apiKeyOk = isValidApiKey(req)
    const { data: { session } } = await supabase.auth.getSession()
    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const client_id = Number(url.searchParams.get('client_id') || 0)
    if (!client_id) {
      return NextResponse.json({ ok: false, error: 'client_id required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('client_web_allowlist')
      .select('id, client_id, domain, enabled, created_at')
      .eq('client_id', client_id)
      .order('domain', { ascending: true })

    if (error) throw error

    return NextResponse.json({ ok: true, data: data || [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'internal error' }, { status: 500 })
  }
}

/**
 * POST body:
 * { client_id: 6, domains: ["cm-valenca.pt","..."], mode: "replace" | "add" }
 * - replace: limpa e mete só os novos
 * - add: adiciona sem apagar
 */
export async function POST(req: Request) {
  try {
    const supabase = createClient()

    const apiKeyOk = isValidApiKey(req)
    const { data: { session } } = await supabase.auth.getSession()
    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const client_id = Number(body.client_id || 0)
    const mode = safe(body.mode || 'replace').toLowerCase()
    const domainsRaw = Array.isArray(body.domains) ? body.domains : []
    const domains = domainsRaw.map(safe).filter(Boolean)

    if (!client_id) {
      return NextResponse.json({ ok: false, error: 'client_id required' }, { status: 400 })
    }

    if (!['replace', 'add'].includes(mode)) {
      return NextResponse.json({ ok: false, error: 'mode must be replace|add' }, { status: 400 })
    }

    if (mode === 'replace') {
      const { error: delErr } = await supabase
        .from('client_web_allowlist')
        .delete()
        .eq('client_id', client_id)
      if (delErr) throw delErr
    }

    if (domains.length > 0) {
      const rows = domains.map((d) => ({ client_id, domain: d, enabled: true }))
      const { error: upErr } = await supabase
        .from('client_web_allowlist')
        .upsert(rows, { onConflict: 'client_id,domain' })
      if (upErr) throw upErr
    }

    const { data, error } = await supabase
      .from('client_web_allowlist')
      .select('id, client_id, domain, enabled, created_at')
      .eq('client_id', client_id)
      .order('domain', { ascending: true })

    if (error) throw error

    return NextResponse.json({ ok: true, data: data || [] })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'internal error' }, { status: 500 })
  }
}