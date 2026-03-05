import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';
import { maybeToolAnswer } from '@/lib/tools/router';
import { shouldSearchWeb, searxngSearch, buildSourcesContext } from '@/lib/web/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

// Trial / Active / Expired
function isServiceActive(client: any) {
  if (!client) return false;

  const status = String(client.status || '').toLowerCase();
  if (status === 'expired') return false;

  const now = Date.now();

  if (status === 'trial') {
    if (!client.trial_end) return false;
    const end = new Date(client.trial_end).getTime();
    if (Number.isNaN(end)) return false;
    return end > now;
  }

  if (status === 'active') {
    if (!client.trial_end) return true;
    const end = new Date(client.trial_end).getTime();
    if (Number.isNaN(end)) return true;
    return end > now;
  }

  return false;
}

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

function stripJsonFromReply(text: string) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const before = text.slice(0, start).trim();
    const after = text.slice(end + 1).trim();
    return [before, after].filter(Boolean).join('\n\n').trim();
  }
  return text.trim();
}

async function getClientAllowlistDomains(supabase: any, client_id: number): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('client_web_allowlist')
      .select('domain')
      .eq('client_id', client_id)
      .eq('enabled', true);

    if (error || !Array.isArray(data)) return [];
    return data.map((r: any) => safeStr(r?.domain)).filter(Boolean);
  } catch {
    return [];
  }
}

function filterSourcesByAllowlistLocal(rawResults: any[], allowDomains: string[]) {
  if (!Array.isArray(rawResults)) return [];
  if (!allowDomains || allowDomains.length === 0) return rawResults;

  const allow = allowDomains.map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''));
  return rawResults.filter((r: any) => {
    const url = safeStr(r?.url);
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      return allow.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  });
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();

    // Auth: API key (server-to-server) OU sessão (dashboard/webhook)
    const apiKeyOk = isValidApiKey(req);
    const { data: { session } } = await supabase.auth.getSession();
    if (!apiKeyOk && !session) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();

    const client_id = Number(body.client_id);
    const phone_e164 = safeStr(body.phone_e164);
    const push_name = safeStr(body.push_name || body.pushName || '');
    const text = safeStr(body.text);

    if (!client_id || !phone_e164 || !text) {
      return NextResponse.json(
        { ok: false, error: 'client_id, phone_e164 e text são obrigatórios' },
        { status: 400 }
      );
    }

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, status, trial_end, bot_instructions, company_name, instance_name')
      .eq('id', client_id)
      .single();
    if (cErr) throw cErr;

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

    // guardar inbound
    await supabase.from('wa_messages').insert([{
      phone_e164,
      instance,
      direction: 'in',
      text,
      raw: { source: 'api/bot/reply', client_id, push_name: push_name || undefined },
    }]);

    // Tool layer
    const tool = maybeToolAnswer(text, 'pt-PT');
    if (tool?.reply) {
      await supabase.from('wa_messages').insert([{
        phone_e164,
        instance,
        direction: 'out',
        text: tool.reply,
        raw: { source: 'tool', tool: tool.tool, push_name: push_name || undefined },
      }]);

      return NextResponse.json({
        ok: true,
        data: { client_id, phone_e164, reply: tool.reply }
      });
    }

    // Prompt
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

    // Histórico (mesma instância)
    let historyMsgs: any[] = [];
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
          .filter((m: any) => m.content.length > 0);
      }
    }

    // Search layer (com allowlist por cliente)
    let systemWithContext = finalPrompt;

    if (shouldSearchWeb(text)) {
      const allowDomains = await getClientAllowlistDomains(supabase, Number(client.id));
      const rawResults = await searxngSearch(text, 8);
      const results = filterSourcesByAllowlistLocal(rawResults, allowDomains).slice(0, 5);

      const ctx = buildSourcesContext(results);

      if (ctx) {
        const allowText =
          allowDomains.length > 0
            ? `- Só podes usar links destes domínios: ${allowDomains.join(', ')}.\n`
            : `- Se não existir allowlist, usa apenas fontes oficiais/autoridade.\n`;

        systemWithContext =
          `${finalPrompt}\n\n` +
          `## Instruções de pesquisa (OBRIGATÓRIO)\n` +
          `- Tens FONTES no contexto. Usa-as para responder.\n` +
          allowText +
          `- No fim, inclui "Fontes:" com 1–3 links.\n` +
          `- Se as fontes forem insuficientes, diz que não consegues confirmar.\n\n` +
          `${ctx}`;
      } else {
        systemWithContext =
          `${finalPrompt}\n\n` +
          `## Instruções (OBRIGATÓRIO)\n` +
          `- Tentaste pesquisa web mas NÃO tens fontes úteis no contexto.\n` +
          `- Não inventes. Diz claramente que não consegues confirmar e sugere o canal oficial.\n`;
      }
    }

    const messages = [
      { role: 'system', content: systemWithContext },
      ...historyMsgs,
      ...(push_name ? [{ role: 'system', content: `Nome do utilizador (WhatsApp): ${push_name}` }] : []),
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
      const fallback = 'Desculpa — tive um problema a responder agora. Tenta outra vez daqui a pouco 🙏';

      await supabase.from('wa_messages').insert([{
        phone_e164,
        instance,
        direction: 'out',
        text: fallback,
        raw: { source: 'groq_error', http_status: res.status, push_name: push_name || undefined },
      }]);

      return NextResponse.json({
        ok: true,
        data: { client_id, phone_e164, reply: fallback }
      });
    }

    let reply = safeStr(data?.choices?.[0]?.message?.content || '');
    const report = extractJsonReport(reply);
    reply = stripJsonFromReply(reply);

    // Ticket se vier __REPORT__
    if (report) {
      const { data: tRows, error: tErr } = await supabase
        .from('tickets')
        .insert([{
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
        }])
        .select('tracking_code')
        .limit(1);

      if (!tErr && tRows?.[0]?.tracking_code) {
        reply = `Feito ✅ Registei o teu pedido com o código **${tRows[0].tracking_code}**. Podes perguntar: “estado ${tRows[0].tracking_code}”.`;
      } else {
        reply = reply || 'Feito ✅ Registei o teu pedido.';
      }
    }

    await supabase.from('wa_messages').insert([{
      phone_e164,
      instance,
      direction: 'out',
      text: reply || 'Ok 👍',
      raw: { model, source: 'groq', push_name: push_name || undefined },
    }]);

    return NextResponse.json({
      ok: true,
      data: { client_id, phone_e164, reply: reply || 'Ok 👍' }
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}