import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiUrl = process.env.EVOLUTION_API_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;

    if (!apiUrl || !apiKey) throw new Error('EVOLUTION_API_URL ou EVOLUTION_API_KEY não configuradas');

    // Simple test call to Evolution (fetch instances)
    const res = await fetch(`${apiUrl}/instance/fetchInstances`, {
      headers: {
        'apikey': apiKey
      }
    });

    if (!res.ok) throw new Error('Erro na resposta da Evolution API');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
