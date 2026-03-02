import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { message, systemPrompt, phone } = await request.json();

    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    if (!apiKey) throw new Error('GROQ_API_KEY não configurada');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Erro no Groq');

    return NextResponse.json({ text: data.choices[0].message.content });

  } catch (error: any) {
    console.error('Groq Chat Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
