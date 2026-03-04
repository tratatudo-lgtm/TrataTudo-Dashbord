export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

// ✅ Trial: válido até trial_end
// ✅ Active: válido; se tiver trial_end, respeita; se não tiver, assume pago
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

// remove qualquer JSON do output final para o utilizador (para não aparecer “lixo” no chat)
function stripJsonFromReply(text: string) {
  const t = safeStr(text);
  if (!t) return '';
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return t;

  // se parece que o modelo colou JSON no fim, remove
  const before = t.slice(0, start).trim();
  return before || t;
}

function normalizeName(pushName: string) {
  const n = safeStr(pushName);
  if (!n) return '';
  // evita nomes enormes
  return n.length > 30 ? n.slice(0, 30) : n;
}

/**
 * (Opcional) Pesquisa via SearXNG
 * Ativa se tiveres SEARXNG_URL no Vercel (ex: http://79.72.48.151:8888)
 */
async function searxSearch(query: string) {
  const base = safeStr(process.env.SEARXNG_URL || '');
  if (!base) return null;

  const url = `${base.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      // evita cache estranha
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data: any = await res.json().catch(() => null);
    if (!data?.results || !Array.isArray(data.results)) return null;

    // devolve top 3
    const top = data.results.slice(0, 3).map((r: any) => ({
      title: safeStr(r?.title),
      url: safeStr(r?.url),
      content: safeStr(r?.content),
    }));

    return top.length ? top : null;
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
    const phone_e164 = safeStr(body.phone_e164);
    const text = safeStr(body.text);
    const push_name = normalizeName(body.push_name || '');

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

    // 🔹 Prompt final (GLOBAL + cliente)
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

    const instance = safeStr(client.instance_name);

    // ✅ HISTÓRICO: últimas 12 mensagens desta pessoa nesta instância
    let historyMsgs: any[] = [];
    if (instance) {
      const { data: hist, error: hErr } = await supabase
        .from('wa_messages')
        .select('direction, text, created_at, raw')
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
          .filter((m: any) => m.content.length > 0);
      }
    }

    // ✅ Contexto anti “olá” + nome (só 1x)
    const hasHistory = historyMsgs.length > 0;

    const systemWithContext =
      `${finalPrompt}\n\n` +
      `### CONTEXTO DE RUNTIME (OBRIGATÓRIO)\n` +
      `- Nome WhatsApp (se existir): "${push_name || ''}"\n` +
      `- Já existe histórico nesta conversa? ${hasHistory ? 'SIM' : 'NÃO'}\n` +
      `REGRAS:\n` +
      `1) Se "Já existe histórico" = SIM, NÃO faças saudações ("olá", "bem-vindo", apresentações). Vai direto ao assunto.\n` +
      `2) Usa o nome WhatsApp no máximo 1 vez de forma natural (se existir).\n` +
      `3) Nunca devolvas JSON ao utilizador. Se gerares JSON interno, ele deve ficar “escondido” (não escrever no texto final).\n`;

    // (Opcional) tentativa de pesquisa se o utilizador perguntar algo factual “de datas/feriados/horários”
    // Só adiciona resultados ao contexto, NÃO mostra links ao utilizador automaticamente.
    const mightNeedSearch =
      /feriado|quando é|data|horário|contacto|telefone|site oficial|decreto|lei/i.test(text);

    let webSnippets = '';
    if (mightNeedSearch) {
      const results = await searxSearch(`${text} ${safeStr(client.company_name || '')}`.trim());
      if (results && results.length) {
        webSnippets =
          `\n### RESULTADOS DE PESQUISA (usar para precisão; não inventar)\n` +
          results.map((r: any, i: number) =>
            `${i + 1}) ${r.title}\n${r.content}\n${r.url}`
          ).join('\n\n') + '\n';
      }
    }

    const messages = [
      { role: 'system', content: systemWithContext + webSnippets },
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

    const replyRaw = safeStr(data?.choices?.[0]?.message?.content || '');

    // ✅ ticket report (se existir)
    const report = extractJsonReport(replyRaw);

    // ✅ texto final sem JSON
    const reply = stripJsonFromReply(replyRaw);

    // 💾 Guardar mensagens (IN e OUT)
    await supabase.from('wa_messages').insert([
      {
        phone_e164,
        instance,
        direction: 'in',
        text,
        raw: { source: 'api/bot/reply', client_id, push_name: push_name || undefined },
      },
      {
        phone_e164,
        instance,
        direction: 'out',
        text: reply,
        raw: { model, source: 'groq', push_name: push_name || undefined },
      },
    ]);

    // ✅ Se vier __REPORT__, cria ticket (sem mostrar ao utilizador)
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