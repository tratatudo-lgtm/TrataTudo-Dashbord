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
  const end = new Date(client.trial_end);
  if (isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function extractJsonReport(replyText: string): any | null {
  const start = replyText.indexOf('{');
  const end = replyText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const chunk = replyText.slice(start, end + 1);
  try {
    const obj = JSON.parse(chunk);
    if (obj && obj.__REPORT__ === true) return obj;
  } catch {}
  return null;
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    // Auth: API key (server-to-server) OU sessão (dashboard)
    const apiKeyOk = isValidApiKey(req);
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const client_id = Number(body.client_id);
    const phone_e164 = safeStr(body.phone_e164 || '');
    const text = safeStr(body.text || '');

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

    // histórico curto (últimas 12 mensagens deste número + instância)
    const { data: historyRows } = await supabase
      .from('wa_messages')
      .select('direction, text, created_at')
      .eq('phone_e164', phone_e164)
      .eq('instance', client.instance_name)
      .order('created_at', { ascending: false })
      .limit(12);

    const history = (historyRows || []).reverse().map((m: any) => ({
      role: m.direction === 'out' ? 'assistant' : 'user',
      content: m.text || '',
    }));

    // 🔹 Prompt final
    const base = await getSystemBasePrompt();
    const finalPrompt = mergePrompts(base, client?.bot_instructions || '');

    if (!finalPrompt) {
      return NextResponse.json(
        { ok: false, error: 'Prompt vazio. Define SYSTEM_BASE_PROMPT ou bot_instructions.' },
        { status: 500 }
      );
    }

    // 3) Chamar Groq (modelo do env)
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
          ...history,
          { role: 'user', content: text }
        ],
      }),
    });

    const rawText = await res.text();
    let data: any = null;
    try { data = JSON.parse(rawText); } catch { data = null; }

    if (!res.ok || !data) {
      return NextResponse.json(
        { ok: false, error: 'Erro ao chamar Groq', debug: rawText?.slice(0, 500) },
        { status: 500 }
      );
    }

    const reply = safeStr(data?.choices?.[0]?.message?.content || '');

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

    // ✅ se vier __REPORT__, grava ticket
    const report = extractJsonReport(reply);
    if (report) {
      await supabase.from('tickets').insert([{
        client_id,
        kind: report.type === 'complaint' ? 'complaint' : 'request',
        category: safeStr(report.category),
        subject: null,
        description: safeStr(report.description),
        priority: report.urgency === 'high' ? 'high' : report.urgency === 'low' ? 'low' : 'normal',
        status: 'new',
        customer_name: safeStr(report.citizen_name),
        customer_contact: safeStr(report.citizen_contact),
        location_text: safeStr(report.location_text),
        channel: safeStr(report.channel || 'whatsapp'),
        metadata: { language: safeStr(report.language || 'pt-PT') },
        raw: report,
      }]);
    }

    return NextResponse.json({
      ok: true,
      data: { client_id, phone_e164, reply },
    });

  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}
