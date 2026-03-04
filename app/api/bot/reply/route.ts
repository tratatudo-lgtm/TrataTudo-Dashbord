import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

// ✅  Trial: válido até trial_end
// ✅  Active: válido; se tiver trial_end, respeita; se não tiver, assume pago (não expira aqui)
// ❌  Expired: bloqueia
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
    if (!client.trial_end) return true; // pago
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

// tenta extrair JSON __REPORT__ (mesmo se vier misturado no texto)
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

// remove qualquer bloco JSON do texto (para nunca aparecer __REPORT__/debug no WhatsApp)
function stripJsonBlocks(text: string) {
  const s = safeStr(text);
  if (!s) return '';
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const before = s.slice(0, start).trim();
    const after = s.slice(end + 1).trim();
    return [before, after].filter(Boolean).join('\n').trim();
  }
  return s;
}

// evita “olá / bem-vindo” repetido quando já existe histórico
function enforceNoRepeatGreeting(reply: string, hasHistory: boolean) {
  const r = safeStr(reply);
  if (!hasHistory) return r;

  const norm = r.toLowerCase();
  const looksLikeGreetingOnly =
    norm.length < 90 &&
    (norm.includes('olá') || norm.includes('ola') || norm.includes('bem-vindo') || norm.includes('bem vindo')) &&
    (norm.includes('como posso ajudar') || norm.includes('em que posso ajudar') || norm.includes('o que precisas'));

  if (looksLikeGreetingOnly) {
    return 'Diz-me só o que precisas e eu trato disso contigo 🙂';
  }
  return r;
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    // Auth: API key (server-to-server) OU sessão (dashboard)
    const apiKeyOk = isValidApiKey(req);
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();

    const client_id = Number(body.client_id);
    const phone_e164 = safeStr(body.phone_e164);
    const text = safeStr(body.text);

    // nome do WhatsApp (quando vier do webhook / api)
    const push_name = safeStr(body.push_name || body.pushName || '');

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
    const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

    if (!groqKey) {
      return NextResponse.json({ ok: false, error: 'GROQ_API_KEY em falta' }, { status: 500 });
    }

    // ✅ HISTÓRICO: últimas 12 mensagens desta pessoa nesta instância
    const instance = safeStr(client.instance_name);
    let historyMsgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (instance) {
      const { data: hist, error: hErr } = await supabase
        .from('wa_messages')
        .select('direction, text, created_at')
        .eq('phone_e164', phone_e164)
        .eq('instance', instance)
        .order('created_at', { ascending: false })
        .limit(12);

      if (!hErr && Array.isArray(hist)) {
        historyMsgs = hist
          .slice()
          .reverse()
          .map((m: any) => ({
            role: m.direction === 'out' ? 'assistant' : 'user',
            content: safeStr(m.text),
          }))
          .filter((m) => m.content.length > 0);
      }
    }

    const hasHistory = historyMsgs.length > 0;

    // 🔒 Regras técnicas extras (nome WhatsApp + anti-saudação + anti-JSON)
    const systemWithContext = `
${finalPrompt}

# Regras técnicas (OBRIGATÓRIO)
- O utilizador chama-se: ${push_name ? push_name : '(desconhecido)'}.
- Se já houver conversa (histórico), NÃO voltes a dizer "olá", "bem-vindo", nem mensagens de apresentação. Vai direto ao assunto.
- NUNCA mostres JSON, nem blocos técnicos, nem "__REPORT__" ao utilizador.
- Se precisares de criar ticket, podes gerar um JSON __REPORT__, mas ele NÃO deve aparecer na mensagem ao utilizador.
`.trim();

    // 🚀 Chamar Groq com contexto
    const messages = [
      { role: 'system' as const, content: systemWithContext },
      ...historyMsgs,
      { role: 'user' as const, content: text },
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

    const replyRaw = safeStr(data?.choices?.[0]?.message?.content || '');
    const report = extractJsonReport(replyRaw);

    // texto “limpo” para o utilizador (sem JSON)
    let replyUser = stripJsonBlocks(replyRaw);
    replyUser = enforceNoRepeatGreeting(replyUser, hasHistory);

    // 💾 Guardar mensagens (IN e OUT) — OUT sempre “limpo”
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
        text: replyUser,
        raw: { model, source: 'groq', push_name },
      },
    ]);

    // ✅ Se vier __REPORT__, cria ticket (e devolve código ao utilizador)
    if (report) {
      const urgency = safeStr(report.urgency);
      const priority = urgency === 'high' ? 'high' : urgency === 'low' ? 'low' : 'normal';

      const insertPayload: any = {
        client_id,
        kind: report.type === 'complaint' ? 'complaint' : 'request',
        category: safeStr(report.category),
        subject: null,
        description: safeStr(report.description),
        priority,
        status: 'new',
        customer_name: safeStr(report.citizen_name),
        customer_contact: safeStr(report.citizen_contact),
        location_text: safeStr(report.location_text),
        channel: safeStr(report.channel || 'whatsapp'),
        metadata: { language: safeStr(report.language || 'pt-PT') },
        raw: report,
      };

      const { data: tData, error: tErr } = await supabase
        .from('tickets')
        .insert([insertPayload])
        .select('tracking_code')
        .maybeSingle();

      if (tErr) {
        console.error('Ticket insert error:', tErr);
      } else if (tData?.tracking_code) {
        replyUser =
          `Feito ✅ Registei o teu pedido com o código **${tData.tracking_code}**.\n` +
          `Podes perguntar a qualquer momento: *estado ${tData.tracking_code}*.`;
      }
    }

    return NextResponse.json({
      ok: true,
      data: { client_id, phone_e164, reply: replyUser },
    });
  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}