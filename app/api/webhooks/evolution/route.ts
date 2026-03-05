// app/api/webhooks/evolution/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeStr(v: any) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function normalizeE164FromRemoteJid(remoteJid: string) {
  // "351937230116@s.whatsapp.net" -> "+351937230116"
  const raw = safeStr(remoteJid).split('@')[0].replace(/[^\d]/g, '')
  if (!raw) return ''
  return raw.startsWith('+') ? raw : `+${raw}`
}

function normalizeEvoNumber(e164: string) {
  // Evolution normalmente quer sem "+"
  return safeStr(e164).replace(/^\+/, '').replace(/[^\d]/g, '')
}

function extractTextFromEvolutionPayload(payload: any): string {
  // tenta apanhar o texto nas variações mais comuns do Evolution/Baileys
  const d = payload?.data || payload
  const msg = d?.message || d?.data?.message

  const conversation =
    msg?.conversation ||
    msg?.extendedTextMessage?.text ||
    msg?.imageMessage?.caption ||
    msg?.videoMessage?.caption ||
    msg?.documentMessage?.caption ||
    ''

  return safeStr(conversation)
}

function getBaseUrl(req: Request) {
  const h = req.headers
  const proto = h.get('x-forwarded-proto') || 'https'
  const host = h.get('x-forwarded-host') || h.get('host') || ''
  if (!host) return ''
  return `${proto}://${host}`
}

function getRelaySecretFromReq(req: Request) {
  const u = new URL(req.url)
  return safeStr(u.searchParams.get('s'))
}

function getExpectedRelaySecret() {
  // aceita nomes alternativos para não te prender a 1 env
  return (
    process.env.TRATATUDO_RELAY_SECRET ||
    process.env.RELAY_SECRET ||
    process.env.WA_RELAY_SECRET ||
    ''
  )
}

function getEvolutionConfig() {
  // aceita nomes alternativos (para não acontecer "missing_EVOLUTION...")
  const url =
    process.env.EVOLUTION_SERVER_URL ||
    process.env.EVO_URL ||
    process.env.SERVER_URL || // (o que tens no docker)
    ''

  const key =
    process.env.EVOLUTION_API_KEY ||
    process.env.EVO_KEY ||
    process.env.AUTHENTICATION_API_KEY || // (o que tens no docker)
    ''

  return { url: safeStr(url), key: safeStr(key) }
}

async function resolveClientIdForInbound(
  supabase: any,
  instanceName: string,
  phoneE164: string
): Promise<{ client_id: number | null; via: string }> {
  // 1) tenta mapear pelo número na tabela client_instances (multi-tenant no hub)
  try {
    const { data, error } = await supabase
      .from('client_instances')
      .select('client_id, phone_e164, instance_name, updated_at')
      .eq('phone_e164', phoneE164)
      // se tiveres instance_name na tabela, isto ajuda a separar hubs/instâncias
      .in('instance_name', [instanceName, ''])
      .order('updated_at', { ascending: false })
      .limit(1)

    if (!error && Array.isArray(data) && data[0]?.client_id) {
      return { client_id: Number(data[0].client_id), via: 'client_instances' }
    }
  } catch {
    // ignora e faz fallback
  }

  // 2) fallback: se não conseguir mapear, usa o "client do hub" (por instance_name)
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('id, instance_name, updated_at')
      .eq('instance_name', instanceName)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (!error && Array.isArray(data) && data[0]?.id) {
      return { client_id: Number(data[0].id), via: 'clients.instance_name' }
    }
  } catch {
    // ignora
  }

  // 3) último fallback: demo id=1 (para não ficar mudo)
  return { client_id: 1, via: 'fallback_client_1' }
}

async function callBotReply(baseUrl: string, body: any) {
  const apiKey = process.env.TRATATUDO_API_KEY || ''
  const res = await fetch(`${baseUrl}/api/bot/reply`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // autoriza sem sessão
      'x-tratatudo-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  const txt = await res.text()
  let json: any = null
  try {
    json = JSON.parse(txt)
  } catch {
    json = null
  }

  return { ok: res.ok && json?.ok, status: res.status, json, raw: txt }
}

async function sendToEvolution(instanceName: string, toE164: string, text: string) {
  const { url, key } = getEvolutionConfig()
  if (!url || !key) {
    return {
      ok: false,
      status: 0,
      raw: 'missing_EVOLUTION_SERVER_URL_or_EVOLUTION_API_KEY',
    }
  }

  const instanceEnc = encodeURIComponent(instanceName)
  const endpoint = `${url.replace(/\/$/, '')}/message/sendText/${instanceEnc}`

  const payload = {
    number: normalizeEvoNumber(toE164),
    text,
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
      },
      body: JSON.stringify(payload),
    })

    const raw = await res.text()
    return { ok: res.ok, status: res.status, raw: raw.slice(0, 600) }
  } catch (e: any) {
    return { ok: false, status: 0, raw: safeStr(e?.message || e) }
  }
}

export async function POST(req: Request) {
  const expectedSecret = getExpectedRelaySecret()
  const gotSecret = getRelaySecretFromReq(req)

  // se tens relay-secret definido, valida
  if (expectedSecret && gotSecret !== expectedSecret) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized_relay', detail: 'Bad relay secret' },
      { status: 401 }
    )
  }

  let payload: any = null
  try {
    payload = await req.json()
  } catch {
    payload = null
  }

  const event = safeStr(payload?.event)
  const instanceName = safeStr(payload?.instance)

  // só tratamos mensagens recebidas
  if (!instanceName || !event) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'missing_instance_or_event' })
  }
  if (event !== 'messages.upsert') {
    return NextResponse.json({ ok: true, ignored: true, reason: 'unsupported_event', event })
  }

  // ignora mensagens enviadas pelo próprio bot
  const fromMe = !!payload?.data?.key?.fromMe
  if (fromMe) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'from_me' })
  }

  const remoteJid = safeStr(payload?.data?.key?.remoteJid)
  const phone_e164 = normalizeE164FromRemoteJid(remoteJid)
  const text = extractTextFromEvolutionPayload(payload)
  const push_name = safeStr(payload?.data?.pushName || payload?.pushName || '')

  if (!phone_e164 || !text) {
    return NextResponse.json({
      ok: true,
      handled: false,
      reason: 'missing_phone_or_text',
      phone_e164,
    })
  }

  const supabase = createClient()

  // resolve client_id correto para ESTE número
  const resolved = await resolveClientIdForInbound(supabase, instanceName, phone_e164)
  const client_id = resolved.client_id

  const baseUrl = getBaseUrl(req)
  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      error: 'missing_base_url',
    }, { status: 500 })
  }

  // chama o bot (que grava no wa_messages e usa prompt do client)
  const botRes = await callBotReply(baseUrl, {
    client_id,
    phone_e164,
    push_name,
    text,
  })

  if (!botRes.ok) {
    return NextResponse.json({
      ok: true,
      handled: false,
      reason: 'bot_no_reply',
      client_id,
      phone_e164,
      resolve_via: resolved.via,
      bot_status: botRes.status,
      bot_ok: botRes.json?.ok ?? false,
      bot_raw_preview: safeStr(botRes.raw).slice(0, 160),
    })
  }

  const reply = safeStr(botRes.json?.data?.reply)
  if (!reply) {
    return NextResponse.json({
      ok: true,
      handled: false,
      reason: 'empty_reply',
      client_id,
      phone_e164,
      resolve_via: resolved.via,
    })
  }

  // envia ao WhatsApp via Evolution
  const evo = await sendToEvolution(instanceName, phone_e164, reply)

  return NextResponse.json({
    ok: true,
    handled: true,
    client_id,
    phone_e164,
    resolve_via: resolved.via,
    reply_preview: reply.slice(0, 160),
    evolution_send_ok: evo.ok,
    evolution_status: evo.status,
    evolution_raw_preview: safeStr(evo.raw).slice(0, 220),
  })
}