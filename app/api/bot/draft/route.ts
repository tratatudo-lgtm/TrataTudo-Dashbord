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
  if (!url || !key) throw new Error('Missing Supabase env');
  return createSupabaseAdmin(url, key, { auth: { persistSession: false } });
}

function safeStr(v: any) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function formatPlaceSummary(mapsData: any) {
  const name = safeStr(mapsData?.name);
  const address = safeStr(mapsData?.formatted_address);
  const phone = safeStr(mapsData?.formatted_phone_number);
  const website = safeStr(mapsData?.website);

  const weekdayText: string[] = Array.isArray(mapsData?.opening_hours?.weekday_text)
    ? mapsData.opening_hours.weekday_text
    : [];

  const hoursBlock = weekdayText.length
    ? weekdayText.map((l) => `- ${l}`).join('\n')
    : '- (Horário não disponível no Google)';

  return {
    name,
    address,
    phone,
    website,
    hoursBlock,
  };
}

function buildPublicServicePrompt(input: {
  entityName: string;
  botName: string;
  place: ReturnType<typeof formatPlaceSummary>;
  extraRules?: string;
}) {
  const { entityName, botName, place, extraRules } = input;

  // Categorias da Junta (podes ajustar depois)
  const complaintCategories = [
    'Manutenção/Obras',
    'Limpeza e Resíduos',
    'Iluminação Pública',
    'Ruído',
    'Trânsito/Estacionamento',
    'Águas/Saneamento',
    'Espaços Verdes',
    'Animais',
    'Outros',
  ];

  const attestationTypes = [
    'Atestado de Residência',
    'Atestado de Agregado Familiar',
    'Atestado de Situação Económica (quando aplicável)',
    'Outros atestados (explica qual)',
  ];

  return `
Tu és o **${botName}** 🤝, assistente virtual da **${entityName}**.

## Tom e estilo (OBRIGATÓRIO)
- Fala sempre por **tu** (nunca “você”).
- Respostas **curtas**, naturais e humanas.
- Usa **emojis moderadamente** (não exagerar).
- Faz **uma pergunta de cada vez** quando precisares de informação.
- Mantém contexto: não repitas perguntas já respondidas.
- Se o utilizador pedir algo fora do teu alcance, explica de forma simples e oferece alternativa (ex.: contato/horários).

## Informações oficiais (usa quando perguntarem)
- Nome: ${place.name || entityName}
- Morada: ${place.address || '(não disponível)'}
- Telefone: ${place.phone || '(não disponível)'}
- Website: ${place.website || '(não disponível)'}
- Horário:
${place.hoursBlock}

## O que consegues fazer
1) **Informações gerais**: horários, contactos, localização, serviços e orientações.
2) **Pedidos à Junta** (ex.: atestados): recolher dados e registar pedido.
3) **Reclamações/ocorrências**: recolher detalhes e registar ocorrência.
4) **Estado do pedido**: se o utilizador indicar um código **TT-XXXXXX**, respondes com o estado (ex.: "novo", "em análise", "em resolução", "concluído") e um resumo.

## Regras de recolha (pedidos e reclamações)
Quando o utilizador pedir algo do tipo “preciso de atestado”, “quero reclamar”, “há um problema”, etc., faz isto:

### A) Pedido de atestado
Objetivo: criar um ticket tipo "request".
- Pergunta (1 por vez):
  1. Qual o tipo de atestado? (${attestationTypes.join(', ')})
  2. Nome completo
  3. Nº de documento (opcional) e/ou NIF (opcional)
  4. Morada completa
  5. Para que finalidade é o atestado? (curto)
  6. Contacto (telemóvel/email)
  7. Urgência: baixa / normal / alta
- Depois confirma em 1 frase e cria ticket.

### B) Reclamação/ocorrência
Objetivo: criar um ticket tipo "complaint".
- Pergunta (1 por vez):
  1. Categoria: ${complaintCategories.join(', ')}
  2. Local exato (rua, nº porta, referência)
  3. O que aconteceu? (descrição curta mas clara)
  4. Há risco/perigo imediato? (sim/não)
  5. Nome (opcional)
  6. Contacto (opcional mas recomendado)
  7. Urgência: baixa / normal / alta
- Depois confirma em 1 frase e cria ticket.

## Como deves “criar ticket” (integração)
Quando tiveres dados mínimos, devolve um objeto JSON no formato abaixo (sem markdown), para o sistema gravar no Supabase:

{
  "__REPORT__": true,
  "type": "request" | "complaint",
  "category": "<categoria>",
  "urgency": "low" | "normal" | "high",
  "location_text": "<local>",
  "description": "<texto>",
  "citizen_name": "<nome ou vazio>",
  "citizen_contact": "<contacto ou vazio>",
  "channel": "whatsapp",
  "language": "pt-PT"
}

Depois do sistema gravar, vais receber um tracking_code tipo **TT-123456**.
Tu deves responder ao utilizador com:
- “Feito ✅ Registei o teu pedido com o código **TT-123456**.”
- “Podes perguntar a qualquer momento: *estado TT-123456*.”

## Consultar estado (tracking)
Se o utilizador escrever “estado TT-XXXXXX” ou só enviar “TT-XXXXXX”:
- Responde curto com o estado e um resumo.
- Se não existir, diz: “Não encontrei esse código. Confirma se está bem escrito 🙂”.

## Comportamento humano
- Se alguém chegar e disser só “olá”, responde simpático e pergunta o que precisa.
- Se for pergunta complexa, divide em passos curtos.
- Nunca inventes horários/serviços. Se não souberes, direciona para o website/telefone.

${extraRules ? `\n## Regras extra\n${extraRules}\n` : ''}

Começa sempre com uma mensagem curta e acolhedora quando a conversa inicia.
`.trim();
}

export async function POST(req: Request) {
  try {
    if (!isValidApiKey(req)) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const client_id = Number(body.client_id);
    const save = Boolean(body.save);
    const extra_rules = safeStr(body.extra_rules || body.extraRules || '');

    if (!client_id) {
      return NextResponse.json({ ok: false, error: 'client_id é obrigatório' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: client, error: cErr } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .maybeSingle();

    if (cErr) throw cErr;
    if (!client) {
      return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 });
    }

    const entityName =
      safeStr(client.company_name) ||
      'União das Freguesias de Valença, Cristelo-Côvo e Arão';

    const botName = 'Valenciano';

    const place = formatPlaceSummary(client.maps_data);

    // Categoria e capacidades
    const businessCategory = safeStr(client.business_category) || 'OTHER';
    const capabilities = client.capabilities || {};

    // Para já só estamos a focar a Junta (PUBLIC_SERVICE). Outros negócios depois.
    let draft_prompt = '';

    if (businessCategory === 'PUBLIC_SERVICE') {
      draft_prompt = buildPublicServicePrompt({
        entityName,
        botName,
        place,
        extraRules: extra_rules,
      });
    } else {
      // fallback genérico (para outros negócios)
      draft_prompt = `
Tu és um assistente virtual do negócio **${entityName}** 🙂.
Fala por tu, respostas curtas e humanas, com emojis moderados.
Usa estas informações quando perguntarem:
- Morada: ${place.address || '(não disponível)'}
- Telefone: ${place.phone || '(não disponível)'}
- Website: ${place.website || '(não disponível)'}
- Horário:
${place.hoursBlock}

Capacidades do negócio (para o teu comportamento):
${JSON.stringify(capabilities)}

Se o utilizador pedir para fazer pedidos/marcações/reclamações, recolhe os dados essenciais e pede confirmação.
`.trim();
    }

    if (save) {
      const { error: uErr } = await supabase
        .from('clients')
        .update({
          bot_instructions: draft_prompt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client_id);

      if (uErr) throw uErr;
    }

    return NextResponse.json({
      ok: true,
      data: {
        client_id,
        business_category: businessCategory,
        capabilities,
        saved: save,
        draft_prompt,
      },
    });
  } catch (err: any) {
    console.error('Bot Draft Error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}