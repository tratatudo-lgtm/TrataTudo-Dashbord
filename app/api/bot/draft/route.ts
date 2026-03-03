import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';

function isValidApiKey(req: Request) {
  const key = req.headers.get('x-tratatudo-key') || '';
  const expected = process.env.TRATATUDO_API_KEY || '';
  return expected.length > 0 && key === expected;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return createSupabaseAdmin(url, key, { auth: { persistSession: false } });
}

async function groqChat(messages: any[], temperature = 0.4) {
  const apiKey = process.env.GROQ_API_KEY || '';
  const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: 1200,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Groq HTTP ${res.status}: ${json?.error?.message || 'Erro na API'}`);
  }

  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq não devolveu conteúdo');
  return text.trim();
}

function buildDraftPrompt(input: {
  clientName: string;
  place: any;
  category: string;
  capabilities: any;
  extraRules?: string;
}) {
  const { clientName, place, category, capabilities, extraRules } = input;

  const name = place?.name || clientName;
  const address = place?.formatted_address || '';
  const phone = place?.formatted_phone_number || place?.international_phone_number || '';
  const website = place?.website || '';
  const rating = place?.rating ? String(place.rating) : '';
  const types = Array.isArray(place?.types) ? place.types.join(', ') : '';

  const opening = place?.opening_hours?.weekday_text
    ? place.opening_hours.weekday_text.join(' | ')
    : '';

  return `
Quero que cries um PROMPT FINAL (texto para colar no campo "bot_instructions") para um chatbot WhatsApp.

Regras globais do bot:
- Fala sempre por "tu" e em português de Portugal.
- Respostas curtas, naturais e humanas (nada robótico).
- Usa emojis com moderação 🙂 (1-2 no máximo por mensagem, quando fizer sentido).
- Se não tiveres informação, pergunta de forma simples e humana.
- Nunca inventes preços, serviços, horários ou políticas: se faltar, pergunta.
- Objetivo: ajudar o cliente e fechar ação (pedido, marcação, visita, contacto).

Dados do negócio (Google Maps):
- Nome: ${name}
- Categoria interna: ${category}
- Tipos Google: ${types}
- Morada: ${address}
- Telefone: ${phone}
- Website: ${website}
- Horário: ${opening}
- Avaliação: ${rating}

Capacidades ativadas (flags):
${JSON.stringify(capabilities, null, 2)}

Agora cria um prompt final que:
1) Define o "personagem" do bot (tom, objetivo, estilo).
2) Lista o que o bot pode fazer (baseado nas flags).
3) Define como recolhe dados quando o utilizador quer:
   - Pedido (se accept_orders=true): pedir itens, quantidades, notas, nome e contacto.
   - Marcação (se accept_bookings=true): pedir serviço, dia/hora preferida, nome e contacto.
   - Reclamação/pedido formal (se accept_complaints/accept_requests=true): pedir categoria, descrição, local, contacto e criar um código de acompanhamento.
4) Inclui a forma de responder a perguntas comuns:
   - horário, morada, contactos, serviços, etc.
5) Mantém contexto (se o utilizador estiver a meio de um pedido, continua sem repetir tudo).

IMPORTANTE:
- Devolve APENAS o prompt final. Nada de explicações.
${extraRules ? `\nRegras extra do cliente:\n${extraRules}\n` : ''}
`.trim();
}

export async function POST(req: Request) {
  try {
    if (!isValidApiKey(req)) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const client_id = Number(body.client_id);
    const extraRules = body.extra_rules ? String(body.extra_rules) : '';

    if (!client_id) {
      return NextResponse.json({ ok: false, error: 'client_id é obrigatório' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: client, error } = await supabase
      .from('clients')
      .select('id, company_name, maps_data, business_category, capabilities')
      .eq('id', client_id)
      .maybeSingle();

    if (error) throw error;
    if (!client) return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 });

    if (!client.maps_data || !client.business_category) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Este cliente ainda não tem dados do Google Maps importados.',
          hint: 'Chama primeiro /api/places/lookup com o maps_url.',
        },
        { status: 400 }
      );
    }

    const prompt = buildDraftPrompt({
      clientName: client.company_name || `Cliente ${client.id}`,
      place: client.maps_data,
      category: client.business_category,
      capabilities: client.capabilities || {},
      extraRules,
    });

    const messages = [
      { role: 'system', content: 'És um especialista em desenhar prompts para chatbots WhatsApp empresariais.' },
      { role: 'user', content: prompt },
    ];

    const draft = await groqChat(messages, 0.35);

    return NextResponse.json({
      ok: true,
      data: {
        client_id,
        business_category: client.business_category,
        capabilities: client.capabilities || {},
        draft_prompt: draft,
      },
    });
  } catch (err: any) {
    console.error('Bot Draft Error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}