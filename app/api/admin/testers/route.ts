import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safe(v: any) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function apiKeyValid(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || ''
  const expected = process.env.TRATATUDO_API_KEY || ''
  return expected && key === expected
}

export async function POST(req: Request) {
  try {
    const supabase = createClient()

    if (!apiKeyValid(req)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const phone = safe(body.phone_e164)
    const forced_client_id = Number(body.forced_client_id)

    if (!phone) {
      return NextResponse.json(
        { ok: false, error: 'phone_e164 required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('client_testers')
      .upsert([
        {
          phone_e164: phone,
          forced_client_id,
          enabled: true,
        },
      ])
      .select()
      .limit(1)

    if (error) throw error

    return NextResponse.json({ ok: true, data: data?.[0] || null })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'internal error' },
      { status: 500 }
    )
  }
}