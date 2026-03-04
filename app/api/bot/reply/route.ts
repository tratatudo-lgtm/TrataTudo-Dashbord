import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

// ✅ Trial: válido até trial_end
// ✅ Active: válido; se tiver trial_end, respeita; se não tiver trial_end, assume pago (não expira aqui)
// ❌ Expired: bloqueia
function isServiceActive(client: any) {
  if (!client) return false;
  const status = String(client.status || '').toLowerCase();
  if (status === 'expired') return false;

  const trialEnd = client.trial_end ? new Date(client.trial_end) : null;
  if (trialEnd && !isNaN(trialEnd.getTime())) {
    return trialEnd.getTime() > Date.now();
  }

  // active sem trial_end => pago (não expira aqui)
  return status === 'active';
}

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// Extrai JSON de report quando o modelo devolver { "__REPORT__": true, ... }
function extractJsonReport(text: string) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const slice = text.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    if (obj && obj.__REPORT__ === true) return obj;
    return null;
  } catch {
    return null;
  }
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

    // 🚫 BLOQUEIO POR STATUS + DATA (trial_end)
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

    // 🔹 Prompt final (base + client)
    const base = await getSystemBasePrompt();
    const finalPrompt = mergePrompts(base, client?.bot_instructions || '');
    if (!finalPrompt) {
      return NextResponse.json(
        { ok: false, error: 'Prompt vazio. Define SYSTEM_BASE_PROMPT ou bot_instructions.' },
        { status: 500 }
      );
    }

    const groqKey = process.env.GROQ_API_KEY || '';
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    if (!groqKey) {
      return NextResponse.json({ ok: false, error: 'GROQ_API_KEY em falta' }, { status: 500 });
    }

    const instanceName = safeStr(client?.instance_name) || `client-${client_id}`;

    // ✅ 1) Buscar histórico (últimas 10 mensagens) para dar contexto e parar de repetir
    const { data: history, error: hErr } = await supabase
      .from('wa_messages')
      .select('direction, text')
      .eq('phone_e164', phone_e164)
      .eq('instance', instanceName)
      .order('created_at', { ascending: false })
      .limit(10);

    if (hErr) {
      console.error('History fetch error:', hErr);
    }

    const historyMessages =
      (history || [])
        .reverse()
        .map((m: any) => ({
          role: m.direction === 'in' ? 'user' : 'assistant',
          content: safeStr(m.text),
        }))
        .filter((m: any) => m.content);

    // ✅ 2) Guardar a mensagem IN antes de chamar o Groq
    const { error: inErr } = await supabase.from('wa_messages').insert([{
      phone_e164,
      instance: instanceName,
      direction: 'in',
      text,
      raw: { source: 'api/bot/reply', client_id },
    }]);

    if (inErr) console.error('Insert IN error:', inErr);

    // ✅ 3) Chamar Groq com prompt + histórico + mensagem atual
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
          ...historyMessages,
          { role: 'user', content: text },
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

    // ✅ 4) Guardar OUT
    const { error: outErr } = await supabase.from('wa_messages').insert([{
      phone_e164,
      instance: instanceName,
      direction: 'out',
      text: reply,
      raw: { model, source: 'groq' },
    }]);

    if (outErr) console.error('Insert OUT error:', outErr);

    // ✅ 5) Se vier __REPORT__, tenta gravar ticket (não falha o reply se der erro)
    const report = extractJsonReport(reply);
    if (report) {
      try {
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
      } catch (e) {
        console.error('Ticket insert error:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      data: { client_id, phone_e164, reply }
    });

  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}