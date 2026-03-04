import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

// ✅ Trial: válido até trial_end
// ✅ Active: válido; se tiver trial_end respeita; se não tiver assume pago (não expira aqui)
// ❌ Expired: bloqueia
function isServiceActive(client: any) {
  if (!client) return false;

  const status = String(client.status || '').toLowerCase();
  if (status === 'expired') return false;

  if (status === 'trial') {
    if (!client.trial_end) return false;
    const end = new Date(client.trial_end);
    if (isNaN(end.getTime())) return false;
    return end.getTime() > Date.now();
  }

  if (status === 'active') {
    if (!client.trial_end) return true;
    const end = new Date(client.trial_end);
    if (isNaN(end.getTime())) return true;
    return end.getTime() > Date.now();
  }

  return false;
}

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Procura um bloco JSON que contenha "__REPORT__": true,
 * devolve:
 *  - clean: texto sem o JSON (para enviar ao WhatsApp)
 *  - report: objeto (para criar ticket)
 */
function extractAndStripReport(fullText: string) {
  const text = safeStr(fullText);
  const marker = '"__REPORT__"';
  const markerPos = text.indexOf(marker);

  if (markerPos === -1) return { clean: text, report: null };

  const start = text.lastIndexOf('{', markerPos);
  const end = text.indexOf('}', markerPos);

  if (start === -1 || end === -1 || end <= start) {
    return { clean: text, report: null };
  }

  const chunk = text.slice(start, end + 1);

  let obj: any = null;
  try {
    obj = JSON.parse(chunk);
  } catch {
    obj = null;
  }

  // remove o JSON do reply para não aparecer no chat
  const clean = safeStr(
    (text.slice(0, start).trimEnd() + '\n' + text.slice(end + 1).trimStart()).trim()
  );

  if (obj && obj.__REPORT__ === true) {
    return { clean, report: obj };
  }

  return { clean, report: null };
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
    const phone_e164 = safeStr(body.phone_e164);
    const text = safeStr(body.text);
    const push_name = safeStr(body.push_name);

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

    // 🚫 Bloqueio por status + data
    if (!isServiceActive(client)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Serviço expirado',
          reason: 'subscription-expired',
          status: client?.status,
          trial_end: client?.trial_end,
        },
        { status: 403 }
      );
    }

    // 🔹 Prompt final
    const base = await getSystemBasePrompt();
    const finalPrompt = mergePrompts(base, client?.bot_instructions || '');
    if (!finalPrompt) {
      return NextResponse.json(
        { ok: false, error: 'Prompt vazio. Define SYSTEM_BASE_PROMPT ou bot_instructions.' },
        { status: 500 }
      );
    }

    const groqKey = process.env.GROQ_API_KEY || '';
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    if (!groqKey) {
      return NextResponse.json({ ok: false, error: 'GROQ_API_KEY em falta' }, { status: 500 });
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
          { role: 'user', content: text },
        ],
      }),
    });

    const raw = await res.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!res.ok || !data) {
      return NextResponse.json(
        { ok: false, error: 'Erro ao chamar Groq', debug: raw?.slice(0, 500) },
        { status: 500 }
      );
    }

    const fullReply = safeStr(data?.choices?.[0]?.message?.content || '');
    const { clean: replyClean, report } = extractAndStripReport(fullReply);

    const instance = safeStr(client.instance_name);

    // 💾 Guardar mensagens (IN e OUT) — OUT guarda já o texto LIMPO (sem JSON)
    await supabase.from('wa_messages').insert([
      {
        phone_e164,
        instance,
        direction: 'in',
        text,
        raw: { source: 'api/bot/reply', client_id, push_name },
      },
      {
        phone_e164,
        instance,
        direction: 'out',
        text: replyClean,
        raw: { model, source: 'groq', push_name },
      },
    ]);

    // ✅ Se veio __REPORT__, criar ticket (mas sem mostrar o JSON no WhatsApp)
    if (report) {
      await supabase.from('tickets').insert([{
        client_id,
        kind: report.type === 'complaint' ? 'complaint' : 'request',
        category: safeStr(report.category),
        subject: null,
        description: safeStr(report.description),
        priority: report.urgency === 'high' ? 'high' : report.urgency === 'low' ? 'low' : 'normal',
        status: 'new',
        customer_name: safeStr(report.citizen_name || push_name),
        customer_contact: safeStr(report.citizen_contact || phone_e164),
        location_text: safeStr(report.location_text),
        channel: safeStr(report.channel || 'whatsapp'),
        metadata: { language: safeStr(report.language || 'pt-PT') },
        raw: report,
      }]);
    }

    return NextResponse.json({
      ok: true,
      data: { client_id, phone_e164, reply: replyClean },
    });

  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}