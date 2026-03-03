import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

function isServiceActive(client: any) {
  if (!client) return false;

  if (client.status !== 'active') return false;

  if (!client.trial_end) return false;

  const now = new Date();
  const end = new Date(client.trial_end);

  if (isNaN(end.getTime())) return false;

  return end.getTime() > now.getTime();
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    const apiKeyOk = isValidApiKey(req);
    const { data: { session } } = await supabase.auth.getSession();

    if (!apiKeyOk && !session) {
      return NextResponse.json(
        { ok: false, error: 'Não autorizado' },
        { status: 401 }
      );
    }

    const body = await req.json();

    const client_id = Number(body.client_id);
    const phone_e164 = String(body.phone_e164 || '');
    const text = String(body.text || '');

    if (!client_id || !phone_e164 || !text) {
      return NextResponse.json(
        { ok: false, error: 'client_id, phone_e164 e text são obrigatórios' },
        { status: 400 }
      );
    }

    // 🔎 Buscar cliente
    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, status, trial_end, bot_instructions, company_name, instance_name')
      .eq('id', client_id)
      .single();

    if (cErr) throw cErr;

    // 🚫 BLOQUEIO POR STATUS + DATA
    if (!isServiceActive(client)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Serviço expirado',
          reason: 'subscription-expired',
          status: client?.status,
          trial_end: client?.trial_end
        },
        { status: 403 }
      );
    }

    // 🔹 Prompt final
    const base = await getSystemBasePrompt();
    const finalPrompt = mergePrompts(base, client?.bot_instructions || '');

    if (!finalPrompt) {
      return NextResponse.json(
        { ok: false, error: 'Prompt vazio.' },
        { status: 500 }
      );
    }

    const groqKey = process.env.GROQ_API_KEY || '';
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!groqKey) {
      return NextResponse.json(
        { ok: false, error: 'GROQ_API_KEY em falta' },
        { status: 500 }
      );
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

    const raw = await res.text();

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }

    if (!res.ok || !data) {
      return NextResponse.json(
        { ok: false, error: 'Erro ao chamar Groq', debug: raw?.slice(0, 500) },
        { status: 500 }
      );
    }

    const reply = data?.choices?.[0]?.message?.content || '';

    // 💾 Guardar mensagens
    await supabase.from('wa_messages').insert([
      {
        phone_e164,
        instance: client.instance_name,
        direction: 'in',
        text,
        raw: { source: 'api/bot/reply', client_id },
      },
      {
        phone_e164,
        instance: client.instance_name,
        direction: 'out',
        text: reply,
        raw: { model, source: 'groq' },
      },
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        client_id,
        phone_e164,
        reply,
      }
    });

  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}