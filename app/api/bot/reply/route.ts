import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';
import { maybeToolAnswer } from '@/lib/tools/router';
import { shouldSearchWeb, searxngSearch, buildSourcesContext, type WebPolicy } from '@/lib/web/search';

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

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

function stripJsonFromReply(text: string) {
  // remove bloco JSON, se existir, para nunca aparecer ao utilizador
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const before = text.slice(0, start).trim();
    const after = text.slice(end + 1).trim();
    return [before, after].filter(Boolean).join('\n\n').trim();
  }
  return text.trim();
}

function normalizeWebPolicy(raw: any): WebPolicy {
  const p = (raw && typeof raw === 'object') ? raw : {};
  const enabled = !!p.enabled;
  const mode = (p.mode === 'open' || p.mode === 'allowlist') ? p.mode : 'allowlist';
  const hosts = Array.isArray(p.hosts) ? p.hosts.map((x: any) => safeStr(x)).filter(Boolean) : [];
  const max_results = p.max_results ? Number(p.max_results) : undefined;

  return { enabled, mode, hosts, max_results };
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
    const push_name = safeStr(body.push_name || body.pushName || '');
    const text = safeStr(body.text);

    if (!client_id || !phone_e164 || !text) {
      return NextResponse.json(
        { ok: false, error: 'client_id, phone_e164 e text são obrigatórios' },
        { status: 400 }
      );
    }

    // 🔎 Buscar cliente (precisamos de instance_name p/ histórico)
    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('id, status, trial_end, bot_instructions, company_name, instance_name, web_policy')
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
    const webPolicy = normalizeWebPolicy((client as any)?.web_policy);

    // ✅ 1) Guardar inbound já (sempre)
    await supabase.from('wa_messages').insert([{
      phone_e164,
      instance,
      direction: 'in',
      text,
      raw: { source: 'api/bot/reply', client_id, push_name: push_name || undefined },
    }]);

    // ✅ 2) TOOL LAYER (A): hora/data (determinístico)
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

    // ✅ 3) HISTÓRICO: últimas 12 mensagens desta pessoa nesta instância
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

    // ✅ 4) SEARCH LAYER (B): Whoogle Proxy quando fizer sentido + permitido por policy
    let systemWithContext = finalPrompt;

    const wantsWeb = shouldSearchWeb(text);
    const webEnabled = !!webPolicy.enabled;

    if (wantsWeb && webEnabled) {
      const n = webPolicy.max_results ? Number(webPolicy.max_results) : 5;
      const results = await searxngSearch(text, n, webPolicy);
      const ctx = buildSourcesContext(results);

      // Se mode=allowlist e não devolveu nada, diz ao modelo que não há fontes oficiais suficientes
      if (ctx) {
        systemWithContext =
          `${finalPrompt}\n\n` +
          `## Instruções de pesquisa (OBRIGATÓRIO)\n` +
          `- Tens FONTES no contexto. Usa-as para responder.\n` +
          `- No fim, inclui "Fontes:" com 1–3 links.\n` +
          `- Se as fontes forem insuficientes, diz que não consegues confirmar.\n\n` +
          `${ctx}`;
      } else {
        // Ajuda o modelo a não inventar
        systemWithContext =
          `${finalPrompt}\n\n` +
          `## Nota (Pesquisa Web)\n` +
          `A pesquisa web estava ativa, mas não foram encontradas fontes permitidas/fiáveis para este cliente.\n` +
          `Não inventes. Se precisares de confirmação externa, pede ao utilizador um link oficial ou diz que não consegues confirmar.\n`;
      }
    }

    // 🚀 5) Chamar Groq com contexto + histórico
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
      await supabase.from('wa_messages').insert([{
        phone_e164,
        instance,
        direction: 'out',
        text: 'Desculpa — tive um problema a responder agora. Tenta outra vez daqui a pouco 🙏',
        raw: { source: 'groq_error', http_status: res.status, push_name: push_name || undefined },
      }]);

      return NextResponse.json({
        ok: true,
        data: {
          client_id,
          phone_e164,
          reply: 'Desculpa — tive um problema a responder agora. Tenta outra vez daqui a pouco 🙏'
        }
      });
    }

    let reply = safeStr(data?.choices?.[0]?.message?.content || '');
    const report = extractJsonReport(reply);
    reply = stripJsonFromReply(reply);

    // ✅ 6) Se vier __REPORT__, cria ticket e responde só com texto + tracking_code
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
        reply = `Feito ✅ Registei o teu pedido com o código **${tRows[0].tracking_code}**. Podes perguntar a qualquer momento: “estado ${tRows[0].tracking_code}”.`;
      } else {
        reply = reply || 'Feito ✅ Registei o teu pedido.';
      }
    }

    // 💾 7) Guardar outbound final
    await supabase.from('wa_messages').insert([{
      phone_e164,
      instance,
      direction: 'out',
      text: reply || 'Ok 👍',
      raw: { model, source: 'groq', push_name: push_name || undefined, web: { enabled: webEnabled, mode: webPolicy.mode, hosts: webPolicy.hosts } },
    }]);

    return NextResponse.json({
      ok: true,
      data: { client_id, phone_e164, reply: reply || 'Ok 👍' }
    });
  } catch (err: any) {
    console.error('BOT REPLY error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}