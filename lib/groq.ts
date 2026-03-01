export async function generateSystemPrompt(businessData: any) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const prompt = `
    És um especialista em criar prompts de sistema para bots de atendimento no WhatsApp.
    O teu objetivo é criar um prompt profissional, amigável e focado em vendas para o seguinte negócio:
    
    DADOS DO NEGÓCIO:
    Nome: ${businessData.name}
    Categoria: ${businessData.category}
    Morada: ${businessData.address}
    Horário: ${businessData.hours}
    Telefone: ${businessData.phone}
    Website: ${businessData.website}
    Rating: ${businessData.rating}
    Resumo de Reviews: ${businessData.reviewsSummary}
    Contexto do Website: ${businessData.websiteText}

    REGRAS DO PROMPT:
    1. O tom deve ser profissional e em Português de Portugal (PT-PT).
    2. Usa "tu" ou "você" de forma consistente (prefere um tom próximo mas respeitoso).
    3. O bot deve saber responder sobre horários, serviços e localização.
    4. Se não souber algo, deve pedir para aguardar um assistente humano.
    5. O prompt deve ser conciso mas completo.

    Gera apenas o texto do prompt de sistema, sem introduções ou explicações.
  `;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Erro ao gerar prompt no Groq');
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
