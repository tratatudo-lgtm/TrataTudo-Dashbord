import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase env');
  return createSupabaseAdmin(url, key, { auth: { persistSession: false } });
}

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * Resolve a instância ativa do cliente.
 * - preferir production_instance_name (se existir)
 * - senão instance_name
 * - senão procurar em client_instances (status=active)
 */
async function resolveInstanceName(admin: ReturnType<typeof getSupabaseAdmin>, client_id: number, clientRow: any) {
  const p = safeStr(clientRow?.production_instance_name);
  if (p) return p;

  const i = safeStr(clientRow?.instance_name);
  if (i) return i;

  const { data, error } = await admin
    .from('client_instances')
    .select('instance_name')
    .eq('client_id', client_id)
    .eq('status', 'active')
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;
  return safeStr(data?.[0]?.instance_name) || 'TrataTudo bot';
}

/**
 * Guarda mensagens na wa_messages (in/out).
 * Campos que tu tens: id, phone_e164, instance, direction, text, raw, created_at
 */
async function saveWaMessage(admin: ReturnType<typeof getSupabaseAdmin>, input: {
  phone_e164: string;
  instance: string;
  direction: 'in' | 'out';
  text: string;
  raw?: any;
}) {
  const payload = {
    phone_e164: input.phone_e164,
    instance: input.instance,
    direction: input.direction,
    text: input.text,
    raw: input.raw ?? null,
    created_at: nowIso(),
  };

  // Não falhar o endpoint por causa de logging
  try {
    const { error } = await admin.from('wa_messages').insert([payload]);
    if (error) console.error('saveWaMessage error:', error);
  } catch (e) {
    console.error('saveWaMessage exception:', e);
  }
}

export async function POST(req: Request) {
  try {
    // Auth: API key (server-to-server) OU sessão (dashboard)
    const supabase = createClient();
    const apiKeyOk = isValidApiKey(req);
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const client_id = Number(body.client_id);
    const phone_e164 = safeStr(body.phone_e164);
    const text = safeStr(body.text);

    if (!client_id || !phone_e164 || !text) {
      return NextResponse.json(
        { ok: false, error: 'client_id, phone_e164 e text são obrigatórios' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    // 1) Buscar client prompt + nomes de instância (se existirem na tabela clients)
    const { data: client, error: cErr } = await admin
      .from('clients')
      .select('id, bot_instructions, company_name, instance_name, production_instance_name, business_category, capabilities')
      .eq('id', client_id)
      .single();
    if (cErr) throw cErr;

    const instanceName = await resolveInstanceName(admin, client_id, client);

    // 2) Base prompt global + prompt do cliente
    const base = await getSystemBasePrompt();
    const finalPrompt = mergePrompts(base, safeStr(client?.bot_instructions));

    if (!finalPrompt) {
      return NextResponse.json(
        { ok: false, error: 'Prompt vazio. Define SYSTEM_BASE_PROMPT ou bot_instructions.' },
        { status: 500 }
      );
    }

    // 3) Guardar mensagem de entrada
    await saveWaMessage(admin, {
      phone_e164,
      instance: instanceName,
      direction: 'in',
      text,
      raw: {
        source: 'api/bot/reply',
        client_id,
      },
    });

    // 4) Chamar Groq
    const groqKey = process.env.GROQ_API_KEY || '';
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    if (!groqKey) {
      return NextResponse.json({ ok: false, error: 'GROQ_API_KEY em falta' }, { status: 500 });
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: finalPrompt },
          { role: 'user', content: text }
        ],
      }),
    });

    const raw = await groqRes.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!groqRes.ok || !data) {
      // guardar falha (opcional)
      await saveWaMessage(admin, {
        phone_e164,
        instance: instanceName,
        direction: 'out',
        text: 'Desculpa — tive um problema técnico a responder. Tenta novamente daqui a pouco 🙂',
        raw: { groq_error: raw?.slice(0, 1000) },
      });

      return NextResponse.json(
        { ok: false, error: 'Erro ao chamar Groq', debug: raw?.slice(0, 500) },
        { status: 500 }
      );
    }

    const reply = safeStr(data?.choices?.[0]?.message?.content);

    // 5) Guardar resposta
    await saveWaMessage(admin, {
      phone_e164,
      instance: instanceName,
      direction: 'out',
      text: reply || '(sem resposta)',
      raw: {
        source: 'groq',
        model,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        client_id,
        phone_e164,
        instance_name: instanceName,
        reply,
      }
    });
  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}