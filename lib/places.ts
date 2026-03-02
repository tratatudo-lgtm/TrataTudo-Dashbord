export async function getPlaceDetails(placeUrl: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY não configurada no servidor.');
  }

  let finalUrl = placeUrl;
  const logs: string[] = [];
  logs.push(`Iniciando resolução para: ${placeUrl}`);

  // 1. Resolver redirects de maps.app.goo.gl
  if (placeUrl.includes('maps.app.goo.gl')) {
    try {
      logs.push('Resolvendo link curto (redirect)...');
      const res = await fetch(placeUrl, { redirect: 'follow', method: 'HEAD' });
      finalUrl = res.url;
      logs.push(`URL final resolvida: ${finalUrl}`);
    } catch (err) {
      logs.push(`Erro ao resolver redirect: ${err}`);
      console.error('Erro ao resolver redirect:', err);
    }
  }

  // 2. Extrair "nome + morada" do finalUrl (decode)
  // O padrão é /maps/place/NOME+MORADA/
  const decodedUrl = decodeURIComponent(finalUrl);
  const placeMatch = decodedUrl.match(/\/maps\/place\/([^\/@]+)/);
  let query = placeMatch ? placeMatch[1].replace(/\+/g, ' ') : '';

  if (!query) {
    logs.push('Não foi possível extrair nome/morada do path /place/. Tentando fallback...');
    // Fallback: tentar pegar o que vier depois do último / se não for um URL
    const parts = decodedUrl.split('/');
    const lastPart = parts[parts.length - 1] || '';
    if (lastPart && !lastPart.startsWith('http')) {
      query = lastPart.split('?')[0].replace(/\+/g, ' ');
    }
  }

  if (!query) {
    query = placeUrl; // Último recurso
    logs.push('Usando URL original como query de busca.');
  } else {
    logs.push(`Query extraída: ${query}`);
  }

  // 3. Chamar Google Places "Find Place From Text"
  logs.push('Chamando findplacefromtext...');
  const findPlaceUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id&key=${apiKey}&language=pt-PT`;
  
  const findRes = await fetch(findPlaceUrl);
  const findData = await findRes.json();

  if (findData.status === 'REQUEST_DENIED') {
    const errorInfo = {
      status: findData.status,
      error_message: findData.error_message,
      endpoint: 'findplacefromtext',
      logs,
      hint: "Verificar Billing + Places API enabled + API key restrictions + referrer/domain no Google Cloud Console."
    };
    throw new Error(JSON.stringify(errorInfo));
  }

  if (!findData.candidates || findData.candidates.length === 0) {
    logs.push('FindPlace não retornou candidatos. Tentando Text Search como fallback...');
    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=pt-PT`;
    const textRes = await fetch(textSearchUrl);
    const textData = await textRes.json();
    
    if (textData.status === 'OK' && textData.results?.[0]) {
      findData.candidates = [{ place_id: textData.results[0].place_id }];
      logs.push(`Place ID encontrado via Text Search: ${findData.candidates[0].place_id}`);
    } else {
      const errorMsg = `Negócio não encontrado no Google Maps com a query: ${query}`;
      throw new Error(JSON.stringify({ error: errorMsg, logs, status: textData.status }));
    }
  }

  let placeId = findData.candidates[0].place_id;
  logs.push(`Place ID obtido: ${placeId}`);

  // Segurança: nunca definir como 'Beka'
  if (placeId === 'Beka') {
    logs.push('AVISO: Place ID retornado foi "Beka", o que é inválido. Abortando.');
    throw new Error(JSON.stringify({ error: 'Place ID inválido retornado pela API', logs }));
  }

  // 4. Obter detalhes completos
  logs.push('Obtendo detalhes do lugar...');
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,opening_hours,website,rating,reviews,types&key=${apiKey}&language=pt-PT`;
  
  const detailsResponse = await fetch(detailsUrl);
  const detailsData = await detailsResponse.json();

  if (detailsData.status === 'REQUEST_DENIED') {
    const errorInfo = {
      status: detailsData.status,
      error_message: detailsData.error_message,
      endpoint: 'details',
      logs,
      hint: "Verificar Billing + Places API enabled + API key restrictions + referrer/domain no Google Cloud Console."
    };
    throw new Error(JSON.stringify(errorInfo));
  }

  if (detailsData.status !== 'OK') {
    throw new Error(JSON.stringify({ 
      error: `Erro no Google Places (${detailsData.status}): ${detailsData.error_message || 'Sem mensagem'}`,
      logs
    }));
  }

  logs.push('Detalhes obtidos com sucesso.');
  return { result: detailsData.result, logs };
}

export async function fetchWebsiteText(url: string) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    
    // Extração básica de texto (sem tags scripts/style)
    const text = html
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
      .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2000); // Limite para não estourar o prompt

    return text;
  } catch (error) {
    console.error('Erro ao ler website:', error);
    return '';
  }
}
