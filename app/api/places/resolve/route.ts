import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const logs: string[] = [];
  try {
    const { input } = await request.json();
    if (!input) return NextResponse.json({ error: 'Input é obrigatório' }, { status: 400 });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY não configurada' }, { status: 500 });

    let targetUrl = input;
    let placeId: string | null = null;

    // 1. Follow redirects for maps.app.goo.gl
    if (input.includes('maps.app.goo.gl')) {
      logs.push('Seguindo redirect de maps.app.goo.gl...');
      const res = await fetch(input, { redirect: 'follow', method: 'HEAD' });
      targetUrl = res.url;
      logs.push(`URL final: ${targetUrl}`);
    }

    // 2. Try to extract place_id from URL
    // Patterns: place_id:ChIJ..., placeid=ChIJ..., place/ChIJ...
    const placeIdMatch = targetUrl.match(/place_id:([A-Za-z0-9_-]+)/) || 
                         targetUrl.match(/placeid=([A-Za-z0-9_-]+)/) ||
                         targetUrl.match(/place\/([A-Za-z0-9_-]+)/);
    
    if (placeIdMatch) {
      placeId = placeIdMatch[1];
      logs.push(`Place ID extraído diretamente: ${placeId}`);
    }

    // 3. If no placeId, use Text Search
    if (!placeId) {
      logs.push('Place ID não encontrado na URL. Tentando Text Search...');
      // Extract name from URL if possible, or use the whole input if it's text
      let query = input;
      if (targetUrl.includes('google.com/maps/search/')) {
        const searchMatch = targetUrl.match(/search\/([^\/\?]+)/);
        if (searchMatch) query = decodeURIComponent(searchMatch[1].replace(/\+/g, ' '));
      } else if (targetUrl.includes('google.com/maps/place/')) {
        const placeMatch = targetUrl.match(/place\/([^\/\?]+)/);
        if (placeMatch) query = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      }

      logs.push(`Query para busca: ${query}`);
      const searchRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`
      );
      const searchData = await searchRes.json();
      
      if (searchData.results && searchData.results.length > 0) {
        placeId = searchData.results[0].place_id;
        logs.push(`Place ID encontrado via Text Search: ${placeId}`);
      } else {
        logs.push('Nenhum resultado no Text Search.');
      }
    }

    if (!placeId) {
      return NextResponse.json({ 
        error: 'Não foi possível encontrar o negócio. Tente um link direto ou o nome completo.',
        logs 
      }, { status: 404 });
    }

    // 4. Get Place Details
    logs.push('Obtendo detalhes do lugar...');
    const detailsRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,website,formatted_phone_number,opening_hours,types,place_id&key=${apiKey}`
    );
    const detailsData = await detailsRes.json();

    if (detailsData.status !== 'OK') {
      return NextResponse.json({ 
        error: `Erro no Place Details: ${detailsData.status}`, 
        logs 
      }, { status: 500 });
    }

    const result = detailsData.result;
    return NextResponse.json({
      place_id: result.place_id,
      name: result.name,
      address: result.formatted_address,
      website: result.website,
      phone: result.formatted_phone_number,
      types: result.types,
      opening_hours: result.opening_hours?.weekday_text,
      logs
    });

  } catch (error: any) {
    console.error('API Places Resolve Error:', error);
    return NextResponse.json({ error: error.message, logs }, { status: 500 });
  }
}
