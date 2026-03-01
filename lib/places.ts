export async function getPlaceDetails(placeUrl: string) {
  // Nota: Extrair o Place ID de um link do Maps pode ser complexo.
  // Idealmente, o user passaria o nome ou o link seria resolvido.
  // Para este MVP, vamos assumir que usamos a Search API para encontrar o negócio pelo link/nome.
  
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  
  // 1. Tentar extrair o nome do negócio do link (simplificado)
  // Ex: https://www.google.com/maps/place/Nome+Do+Negocio/...
  const decodedUrl = decodeURIComponent(placeUrl);
  const match = decodedUrl.match(/place\/([^\/]+)/);
  const query = match ? match[1].replace(/\+/g, ' ') : placeUrl;

  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}&language=pt-PT`;
  
  const searchResponse = await fetch(searchUrl);
  const searchData = await searchResponse.json();

  if (!searchData.results || searchData.results.length === 0) {
    throw new Error('Negócio não encontrado no Google Maps');
  }

  const placeId = searchData.results[0].place_id;

  // 2. Obter detalhes completos
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,opening_hours,website,rating,reviews,types&key=${apiKey}&language=pt-PT`;
  
  const detailsResponse = await fetch(detailsUrl);
  const detailsData = await detailsResponse.json();

  return detailsData.result;
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
