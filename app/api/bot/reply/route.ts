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

// Anti "olá" repetido (GLOBAL - para todos os clientes)
// - Só podes cumprimentar/apresentar 1x na primeira interação.
// - Se já houver histórico, responde direto e fluido sem recomeçar a conversa.
function addAntiGreetingRules(systemPrompt: string, hasHistory: boolean, pushName?: string) {
  const name = safeStr(pushName);
  const who = name ? `O nome do utilizador é "${name}". Se fizer sentido, trata-o pelo nome.` : '';

  const base = `
## Regras globais anti-repetição (OBRIGATÓRIO)
- NÃO recomeças a conversa com "Olá", "Bom dia", "Boa tarde", "Boa noite", nem "Sou o ..." em todas as mensagens.
- Só podes fazer a saudação inicial 1 vez (na primeira interação com este utilizador).
- Se já existir histórico, continua a conversa de forma direta e humana, mantendo contexto.
${who}
`.trim();

  const hasHist = `
## Histórico existente
- Já existe histórico desta conversa. É PROIBIDO voltares a apresentar-te ou repetir saudações.
`.trim();

  return [String(systemPrompt||'').trim(), base, hasHistory ? hasHist : ''].filter(Boolean).join('\n\n');
}


// 🔒 Remove saudações repetidas no início (quando já há histórico)
function stripRepeatedGreeting(reply: string) {
  let s = safeStr(reply);

  // remove linhas iniciais vazias
  s = s.replace(/^\s+/, '');

  // padrões comuns no PT (com e sem emoji/pontuação)
  const patterns: RegExp[] = [
    /^ol[áa][!.\s,🙂😊😄😁😃😅😉🙋‍♂️🙋‍♀️🙋]+\s*/i,
    /^oi[!.\s,🙂😊😄😁😃😅😉🙋‍♂️🙋‍♀️🙋]+\s*/i,
    /^bom\s+dia[!.\s,🙂😊😄😁😃😅😉🙋‍♂️🙋‍♀️🙋]+\s*/i,
    /^boa\s+tarde[!.\s,🙂😊😄😁😃😅😉🙋‍♂️🙋‍♀️🙋]+\s*/i,
    /^boa\s+noite[!.\s,🙂😊😄😁😃😅😉🙋‍♂️🙋‍♀️🙋]+\s*/i,
    /^ol[áa]\s+!?\s*/i,
  ];

  for (const re of patterns) {
    s = s.replace(re, '');
  }

  // se ficou vazio, volta ao original
  if (!s.trim()) return safeStr(reply);
  return s.trim();
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
    const push_name = safeStr(body.push_name || body.pushName || '');

    if (!client_id || !phone_e164 || !text) {
      return NextResponse.json(
        { ok: false, error: 'client_id, phone_e164 e text são obrigatórios' },
        { status: 400 }
      );
    }

    // 🔎 Buscar cliente (precisamos de instance_name p/ histórico)
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

    const instance = safeStr(client.instance_name);

    // ✅ HISTÓRICO: últimas 12 mensagens desta pessoa nesta instância
    let historyMsgs: any[] = [];
    let hasHistory = false;

    if (instance) {
      const { data: hist, error: hErr } = await supabase
        .from('wa_messages')
        .select('direction, text, created_at')
        .eq('phone_e164', phone_e164)
        .eq('instance', instance)
        .order('created_at', { ascending: false })
        .limit(12);

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

    // 👤 Dica de nome (não inventar; só usar se vier do WhatsApp)
    const nameHint = push_name
      ? `Nome do utilizador no WhatsApp: "${push_name}". Se fizer sentido, trata a pessoa pelo primeiro nome (sem repetir sempre).`
      : `Se não souberes o nome do utilizador, não inventes.`;

    // 🚀 Chamar Groq com contexto
    const messages = [
      { role: 'system', content: finalPrompt },
      { role: 'system', content: nameHint },
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

    let reply = safeStr(data?.choices?.[0]?.message?.content || '');

    // ✅ CORTE FORÇADO: se já existe histórico, remove "olá/bom dia/oi" do início
    if (hasHistory) {
      reply = stripRepeatedGreeting(reply);
    }

    // 💾 Guardar mensagens (IN e OUT) — guarda também o push_name no raw
    await supabase.from('wa_messages').insert([
      {
        phone_e164,
        instance,
        direction: 'in',
        text,
        raw: { source: 'api/bot/reply', client_id, push_name: push_name || null },
      },
      {
        phone_e164,
        instance,
        direction: 'out',
        text: reply,
        raw: { model, source: 'groq', push_name },
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