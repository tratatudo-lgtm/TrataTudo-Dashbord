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

function normalizeMapsUrl(input: string) {
  const url = input.trim();
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `https://${url}`;
}

async function resolveRedirect(url: string) {
  const res = await fetch(url, { redirect: 'follow' });
  return res.url || url;
}

function extractPlaceIdFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const pid = u.searchParams.get('place_id');
    if (pid) return pid;

    const qpid = u.searchParams.get('query_place_id');
    if (qpid) return qpid;

    const m1 = urlStr.match(/(ChI[a-zA-Z0-9_-]{10,})/);
    if (m1?.[1]) return m1[1];

    return null;
  } catch {
    const m = urlStr.match(/(ChI[a-zA-Z0-9_-]{10,})/);
    return m?.[1] || null;
  }
}

function extractCoordsFromUrl(urlStr: string): { lat: number; lng: number } | null {
  // formato comum: .../maps/place/.../@41.934, -8.645,17z
  const m = urlStr.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function extractNameFromGoogleMapsPlaceUrl(urlStr: string): string | null {
  // https://www.google.com/maps/place/NAME/data=...
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex(p => p === 'place');
    if (idx >= 0 && parts[idx + 1]) {
      const raw = parts[idx + 1];
      // pode vir com + e %xx
      const name = decodeURIComponent(raw.replace(/\+/g, ' ')).trim();
      return name || null;
    }
    return null;
  } catch {
    return null;
  }
}

type BusinessCategory =
  | 'FOOD_SERVICE'
  | 'APPOINTMENT_BASED'
  | 'RETAIL_STORE'
  | 'PUBLIC_SERVICE'
  | 'HOSPITALITY'
  | 'HEALTH'
  | 'AUTOMOTIVE'
  | 'EDUCATION'
  | 'OTHER';

function classifyBusiness(types: string[] = []): BusinessCategory {
  const t = new Set(types);

  if (t.has('local_government_office') || t.has('city_hall') || t.has('government_office')) return 'PUBLIC_SERVICE';

  if (
    t.has('restaurant') || t.has('cafe') || t.has('bar') || t.has('bakery') ||
    t.has('meal_takeaway') || t.has('meal_delivery') || t.has('food')
  ) return 'FOOD_SERVICE';

  if (
    t.has('hair_care') || t.has('beauty_salon') || t.has('spa') ||
    t.has('dentist') || t.has('doctor') || t.has('physiotherapist')
  ) return 'APPOINTMENT_BASED';

  if (
    t.has('store') || t.has('shopping_mall') || t.has('supermarket') ||
    t.has('hardware_store') || t.has('jewelry_store') || t.has('clothing_store') ||
    t.has('shoe_store') || t.has('electronics_store') || t.has('furniture_store') ||
    t.has('home_goods_store') || t.has('pet_store') || t.has('book_store')
  ) return 'RETAIL_STORE';

  if (t.has('lodging') || t.has('hotel')) return 'HOSPITALITY';
  if (t.has('hospital') || t.has('pharmacy') || t.has('health')) return 'HEALTH';
  if (t.has('car_repair') || t.has('car_dealer') || t.has('gas_station')) return 'AUTOMOTIVE';
  if (t.has('school') || t.has('university')) return 'EDUCATION';

  return 'OTHER';
}

function suggestCapabilities(category: BusinessCategory) {
  const base = {
    show_hours: true,
    show_location: true,
    show_contact: true,
    accept_questions: true,
    accept_orders: false,
    accept_bookings: false,
    accept_complaints: false,
    accept_requests: false,
  };

  if (category === 'FOOD_SERVICE') return { ...base, accept_orders: true, accept_bookings: true };
  if (category === 'APPOINTMENT_BASED') return { ...base, accept_bookings: true };
  if (category === 'RETAIL_STORE') return { ...base, accept_orders: true };
  if (category === 'PUBLIC_SERVICE') return { ...base, accept_complaints: true, accept_requests: true };

  return base;
}

async function googleJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  return json;
}

async function findPlaceIdFromText(text: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY || '';
  if (!key) throw new Error('Missing GOOGLE_PLACES_API_KEY');

  const url =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(text)}` +
    `&inputtype=textquery` +
    `&fields=place_id,name,formatted_address` +
    `&language=pt-PT` +
    `&key=${encodeURIComponent(key)}`;

  const json = await googleJson(url);
  if (json.status !== 'OK') return null;
  const cand = json.candidates?.[0];
  return cand?.place_id || null;
}

async function findPlaceIdNearby(lat: number, lng: number, keyword: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY || '';
  if (!key) throw new Error('Missing GOOGLE_PLACES_API_KEY');

  // raio pequeno para evitar falsos positivos
  const radius = 300;

  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${encodeURIComponent(`${lat},${lng}`)}` +
    `&radius=${radius}` +
    `&keyword=${encodeURIComponent(keyword)}` +
    `&language=pt-PT` +
    `&key=${encodeURIComponent(key)}`;

  const json = await googleJson(url);
  if (json.status !== 'OK') return null;
  const r = json.results?.[0];
  return r?.place_id || null;
}

async function fetchPlaceDetails(placeId: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY || '';
  if (!key) throw new Error('Missing GOOGLE_PLACES_API_KEY');

  const fields = [
    'place_id',
    'name',
    'formatted_address',
    'formatted_phone_number',
    'international_phone_number',
    'website',
    'opening_hours',
    'types',
    'rating',
    'user_ratings_total',
    'url',
    'geometry',
  ].join(',');

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=${encodeURIComponent(fields)}` +
    `&language=pt-PT` +
    `&key=${encodeURIComponent(key)}`;

  const json = await googleJson(url);
  if (json.status !== 'OK') {
    throw new Error(`Google Places details error: ${json.status}${json.error_message ? ` - ${json.error_message}` : ''}`);
  }
  return json.result;
}

export async function POST(req: Request) {
  try {
    if (!isValidApiKey(req)) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const client_id = Number(body.client_id);
    const maps_url_raw = String(body.maps_url || '');

    if (!client_id || !maps_url_raw) {
      return NextResponse.json({ ok: false, error: 'client_id e maps_url são obrigatórios' }, { status: 400 });
    }

    const maps_url = normalizeMapsUrl(maps_url_raw);
    const finalUrl = await resolveRedirect(maps_url);

    // 1) tentar place_id direto
    let placeId = extractPlaceIdFromUrl(finalUrl) || extractPlaceIdFromUrl(maps_url);

    // 2) fallback: extrair nome e tentar findplacefromtext
    const nameFromUrl = extractNameFromGoogleMapsPlaceUrl(finalUrl);
    if (!placeId && nameFromUrl) {
      placeId = await findPlaceIdFromText(nameFromUrl);
    }

    // 3) fallback: coordenadas + nearby search (keyword = nome)
    const coords = extractCoordsFromUrl(finalUrl);
    if (!placeId && coords && nameFromUrl) {
      placeId = await findPlaceIdNearby(coords.lat, coords.lng, nameFromUrl);
    }

    if (!placeId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não consegui resolver place_id a partir do link.',
          hint: 'Tenta abrir o link do Maps e copiar “Partilhar” → “Copiar link” (link longo) OU cola o nome do negócio.',
          debug: { maps_url, finalUrl, nameFromUrl, coords },
        },
        { status: 400 }
      );
    }

    const place = await fetchPlaceDetails(placeId);
    const category = classifyBusiness(place?.types || []);
    const capabilities = suggestCapabilities(category);

    const supabase = getSupabaseAdmin();
    const { data: updated, error } = await supabase
      .from('clients')
      .update({
        maps_url,
        maps_place_id: placeId,
        maps_data: place,
        business_category: category,
        capabilities,
        updated_at: new Date().toISOString(),
      })
      .eq('id', client_id)
      .select('id, company_name, phone_e164, maps_url, maps_place_id, business_category, capabilities')
      .maybeSingle();

    if (error) throw error;
    if (!updated) return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 });

    return NextResponse.json({
      ok: true,
      data: {
        client: updated,
        place_summary: {
          name: place?.name,
          address: place?.formatted_address,
          phone: place?.formatted_phone_number || place?.international_phone_number,
          website: place?.website,
          rating: place?.rating,
          types: place?.types || [],
        },
      },
    });
  } catch (err: any) {
    console.error('Places Lookup Error:', err);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro interno' }, { status: 500 });
  }
}