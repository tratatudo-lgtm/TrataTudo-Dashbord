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

async function resolveClientOverride(
  supabase: any,
  requestedClientId: number,
  phone: string
) {
  const { data } = await supabase
    .from('client_testers')
    .select('forced_client_id, enabled')
    .eq('phone_e164', phone)
    .maybeSingle()

  if (data && data.enabled && data.forced_client_id) {
    return Number(data.forced_client_id)
  }

  return requestedClientId
}

export async function POST(req: Request) {
  try {
    const supabase = createClient()

    const apiKeyOk = apiKeyValid(req)
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const requested_client_id = Number(body.client_id)
    const phone_e164 = safe(body.phone_e164)
    const text = safe(body.text)

    if (!requested_client_id || !phone_e164 || !text) {
      return NextResponse.json(
        { ok: false, error: 'missing parameters' },
        { status: 400 }
      )
    }

    const client_id = await resolveClientOverride(
      supabase,
      requested_client_id,
      phone_e164
    )

    const { data: client } = await supabase
      .from('clients')
      .select('id,status,trial_end,instance_name,bot_instructions')
      .eq('id', client_id)
      .single()

    if (!client) {
      return NextResponse.json(
        { ok: false, error: 'client not found' },
        { status: 404 }
      )
    }

    const reply = `Cliente activo: ${client_id}`

    await supabase.from('wa_messages').insert([
      {
        client_id,
        phone_e164,
        instance: client.instance_name,
        direction: 'out',
        text: reply,
      },
    ])

    return NextResponse.json({
      ok: true,
      data: {
        requested_client_id,
        client_id,
        phone_e164,
        reply,
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || 'internal error' },
      { status: 500 }
    )
  }
}