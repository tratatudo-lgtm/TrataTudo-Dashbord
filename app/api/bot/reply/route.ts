import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

// ✅ Trial: válido até trial_end
// ✅ Active: válido; se tiver trial_end, respeita; se não tiver, assume pago (não expira aqui)
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

// tenta extrair JSON __REPORT__ sem rebentar
function extractJsonReport(text: string) {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    const chunk = text.slice(start, end + 1);
    const obj = JSON.parse(chunk);
    if (obj && obj.__REPORT__ === true) return obj;
    return null;
  } catch {
    return null;
  }
}

// pega no primeiro nome (para tratar pelo nome sem ser estranho)
function firstName(full: string) {
  const s = safeStr(full);
  if (!s) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  return parts[0] || '';
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

    // ✅ nome WhatsApp (Evolution costuma chamar pushName)
    const pushName = safeStr(body.push_name || body.pushName || body.contact_name || body.name);

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

    // 🔹 Prompt final = base + cliente
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

    // ✅ HISTÓRICO: últimas 20 mensagens desta pessoa nesta instância
    const instance = safeStr(client.instance_name);
    let historyMsgs: any[] = [];
    let hasHistory = false;

    if (instance) {
      const { data: hist, error: hErr } = await supabase
        .from('wa_messages')
        .select('direction, text, created_at')
        .eq('phone_e164', phone_e164)
        .eq('instance', instance)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!hErr && Array.isArray(hist) && hist.length > 0) {
        hasHistory = true;
        historyMsgs = hist
          .slice()
          .reverse()
          .map((m: any) => ({
            role: m.direction === 'out' ? 'assistant' : 'user',
            content: safeStr(m.text),
          }))
          .filter((m: any) => m.content.length > 0);
      }
    }

    // ✅ Anti-"Olá" quando já existe conversa
    // (Isto resolve o comportamento de repetir "Olá!" em cada mensagem.)
    const antiGreetingRule = hasHistory
      ? `REGRAS IMPORTANTES (APLICA NESTA RESPOSTA):
- Já existe conversa anterior com este utilizador. NÃO voltes a cumprimentar ("Olá", "Boa noite", etc.).
- Responde diretamente ao que o utilizador pediu agora.
- Mantém o contexto e continua a conversa naturalmente.`
      : '';

    // ✅ Nome (se existir) para tratar pelo nome
    const userName = firstName(pushName);
    const nameRule = userName
      ? `CONTEXTO DO UTILIZADOR:
- Nome no WhatsApp: "${userName}". Trata pelo primeiro nome quando fizer sentido, sem exagerar.`
      : '';

    // 🚀 Chamar Groq com contexto
    const messages = [
      { role: 'system', content: finalPrompt },
      ...(nameRule ? [{ role: 'system', content: nameRule }] : []),
      ...(antiGreetingRule ? [{ role: 'system', content: antiGreetingRule }] : []),
      ...historyMsgs,
      { role: 'user', content: text },
    ];

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
      }),
    });

    const raw = await res.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = null; }

    if (!res.ok || !data) {
      return NextResponse.json(
        { ok: false, error: 'Erro ao chamar Groq', debug: raw?.slice(0, 500) },
        { status: 500 }
      );
    }

    const reply = safeStr(data?.choices?.[0]?.message?.content || '');

    // 💾 Guardar mensagens (IN e OUT)
    await supabase.from('wa_messages').insert([
      {
        phone_e164,
        instance,
        direction: 'in',
        text,
        raw: { source: 'api/bot/reply', client_id, push_name: pushName || null },
      },
      {
        phone_e164,
        instance,
        direction: 'out',
        text: reply,
        raw: { model, source: 'groq', push_name: pushName || null },
      },
    ]);

    // ✅ Se vier __REPORT__, cria ticket
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
      data: { client_id, phone_e164, reply }
    });
  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}