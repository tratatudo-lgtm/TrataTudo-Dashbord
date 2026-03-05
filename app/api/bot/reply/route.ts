// app/api/bot/reply/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSystemBasePrompt, mergePrompts } from '@/lib/promptBase';
import { maybeToolAnswer } from '@/lib/tools/router';

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

// ✅ Trial: válido até trial_end
// ✅ Active: válido; se tiver trial_end, respeita; se não tiver, assume pago (não expira aqui)
// ❌ Expired: bloqueia
function isServiceActive(client: any) {
  if (!client) return false;

  const status = String(client.status || '').toLowerCase();
  if (status === 'expired') return false;

  const now = Date.now();

  if (status === 'trial') {
    if (!client.trial_end) return false;
    const end = new Date(client.trial_end);
    if (isNaN(end.getTime())) return false;
    return end.getTime() > now;
  }

  if (status === 'active') {
    if (!client.trial_end) return true;
    const end = new Date(client.trial_end);
    if (isNaN(end.getTime())) return true;
    return end.getTime() > now;
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

function shouldSearchWeb(text: string) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;

  // evita pesquisar para conversa trivial
  const smallTalk = ['olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'obrigado', 'obrigada', 'ok', 'teste', 'test'];
  if (smallTalk.includes(t)) return false;

  // sinais fortes de factualidade/atualidade
  const triggers = [
    'quando', 'qual', 'quem', 'onde', 'horário', 'horario', 'feriado',
    'preço', 'preco', 'telefone', 'morada', 'site', 'link', 'regulamento',
    'data', 'requisitos', 'documentos', 'taxa', 'valor',
  ];
  if (t.includes('?')) return true;
  return triggers.some((k) => t.includes(k));
}

function getBaseUrlFromRequest(req: Request) {
  // Vercel / proxies
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host') ||
    process.env.VERCEL_URL ||
    '';
  if (!host) return '';
  const h = host.startsWith('http') ? host : `${proto}://${host}`;
  return h.replace(/\/$/, '');
}

function parseAllowHosts(client: any): string[] {
  // Preferência:
  // 1) web_policy { enabled, hosts[] }
  // 2) web_allow_hosts "a.com, b.pt"
  // 3) vazio
  try {
    const wp = client?.web_policy;
    if (wp && typeof wp === 'object' && wp.enabled === true) {
      const hosts = Array.isArray(wp.hosts) ? wp.hosts : [];
      return hosts.map((x: any) => safeStr(x)).filter(Boolean);
    }
  } catch {}
  const raw = safeStr(client?.web_allow_hosts || '');
  if (!raw) return [];
  return raw
    .split(',')
    .map((x) => safeStr(x).replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
}

type SearchResult = { title?: string; url?: string; snippet?: string; source?: string };

function filterResultsByAllowlist(results: SearchResult[], allowDomains: string[]) {
  if (!Array.isArray(results)) return [];
  if (!allowDomains || allowDomains.length === 0) return results;

  const allow = allowDomains
    .map((d) => d.toLowerCase().trim())
    .filter(Boolean);

  return results.filter((r) => {
    const u = safeStr(r?.url).toLowerCase();
    if (!u) return false;
    return allow.some((d) => u.includes(`://${d}`) || u.includes(`.${d}/`) || u.includes(`//${d}/`));
  });
}

function buildSourcesContext(results: SearchResult[]) {
  if (!Array.isArray(results) || results.length === 0) return '';

  const lines: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const url = safeStr(r?.url);
    if (!url) continue;
    const title = safeStr(r?.title) || url;
    const snippet = safeStr(r?.snippet);
    lines.push(`### Fonte ${i + 1}`);
    lines.push(`Título: ${title}`);
    lines.push(`URL: ${url}`);
    if (snippet) lines.push(`Excerto: ${snippet}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

async function toolsSearch(req: Request, query: string, n: number, domains: string[]) {
  const baseUrl = getBaseUrlFromRequest(req);
  if (!baseUrl) return { ok: false, results: [] as SearchResult[] };

  const url = new URL(`${baseUrl}/api/tools/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('n', String(Math.max(1, Math.min(10, n || 5))));
  if (domains && domains.length > 0) url.searchParams.set('domains', domains.join(','));

  // Chamada interna ao teu endpoint Vercel (que por sua vez fala com o Whoogle/proxy)
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'accept': 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) return { ok: false, results: [] as SearchResult[] };
  const data: any = await res.json().catch(() => null);
  const results = Array.isArray(data?.results) ? (data.results as SearchResult[]) : [];
  return { ok: true, results };
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
      .select('id, status, trial_end, bot_instructions, company_name, instance_name, web_allow_hosts, web_policy')
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

    const instance = safeStr(client.instance_name) || 'TrataTudo bot';

    // ✅ 1) Guardar inbound já (sempre)
    await supabase.from('wa_messages').insert([{
      client_id,
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
        client_id,
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
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    if (!groqKey) {
      return NextResponse.json({ ok: false, error: 'GROQ_API_KEY em falta' }, { status: 500 });
    }

    // ✅ 3) HISTÓRICO: últimas 12 mensagens desta pessoa nesta instância
    let historyMsgs: any[] = [];
    if (instance) {
      const { data: hist, error: hErr } = await supabase
        .from('wa_messages')
        .select('direction, text, created_at')
        .eq('client_id', client_id)
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

    // ✅ 4) SEARCH LAYER (B): usa /api/tools/search (Vercel) + allowlist
    let systemWithContext = finalPrompt;

    if (shouldSearchWeb(text)) {
      const allowDomains = parseAllowHosts(client);
      const search = await toolsSearch(req, text, 6, allowDomains);
      const filtered = filterResultsByAllowlist(search.results, allowDomains).slice(0, 3);
      const ctx = buildSourcesContext(filtered);

      if (ctx) {
        const allowText =
          allowDomains.length > 0
            ? `- Só podes usar fontes destes domínios: ${allowDomains.join(', ')}.\n`
            : `- Sem allowlist: usa apenas fontes oficiais/autoridade.\n`;

        // ✅ MAIS FORTE: se há fontes, NÃO PODES responder sem as usar.
        systemWithContext =
          `${finalPrompt}\n\n` +
          `## Instruções de pesquisa (OBRIGATÓRIO)\n` +
          `- Tens FONTES no contexto. Tens de as usar.\n` +
          allowText +
          `- Responde com factos suportados nas fontes.\n` +
          `- Se as fontes não tiverem a resposta, diz claramente que não consegues confirmar.\n` +
          `- No fim, inclui "Fontes:" com 1–3 URLs EXATAS (as do contexto).\n\n` +
          `## Fontes (contexto)\n` +
          `${ctx}`;
      } else {
        systemWithContext =
          `${finalPrompt}\n\n` +
          `## Instruções (OBRIGATÓRIO)\n` +
          `- Tentaste pesquisa web mas NÃO tens fontes úteis no contexto.\n` +
          `- Não inventes. Diz claramente que não consegues confirmar e sugere o canal oficial.\n`;
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
      const fallback = 'Desculpa — tive um problema a responder agora. Tenta outra vez daqui a pouco 🙏';

      await supabase.from('wa_messages').insert([{
        client_id,
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
      client_id,
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
    console.error('BOT REPLY error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}