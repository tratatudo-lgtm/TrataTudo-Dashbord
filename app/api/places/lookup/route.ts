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
  // segue redirects (maps.app.goo.gl -> google.com/maps/...)
  const res = await fetch(url, { redirect: 'follow' });
  // em node, res.url costuma ser o URL final após redirects
  return res.url || url;
}

function extractPlaceIdFromUrl(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);

    // 1) Query params
    const pid = u.searchParams.get('place_id');
    if (pid) return pid;

    // 2) Às vezes vem como "query_place_id"
    const qpid = u.searchParams.get('query_place_id');
    if (qpid) return qpid;

    // 3) Algumas URLs têm "ChIJ..." algures
    const m1 = urlStr.match(/(ChI[a-zA-Z0-9_-]{10,})/);
    if (m1?.[1]) return m1[1];

    return null;
  } catch {
    // tentar regex mesmo se não for URL válida
    const m = urlStr.match(/(ChI[a-zA-Z0-9_-]{10,})/);
    return m?.[1] || null;
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

  // Public / Government
  if (t.has('local_government_office') || t.has('city_hall') || t.has('government_office')) return 'PUBLIC_SERVICE';

  // Food
  if (
    t.has('restaurant') || t.has('cafe') || t.has('bar') || t.has('bakery') ||
    t.has('meal_takeaway') || t.has('meal_delivery') || t.has('food')
  ) return 'FOOD_SERVICE';

  // Appointment-based
  if (
    t.has('hair_care') || t.has('beauty_salon') || t.has('spa') ||
    t.has('dentist') || t.has('doctor') || t.has('physiotherapist')
  ) return 'APPOINTMENT_BASED';

  // Retail
  if (
    t.has('store') || t.has('shopping_mall') || t.has('supermarket') ||
    t.has('hardware_store') || t.has('jewelry_store') || t.has('clothing_store') ||
    t.has('shoe_store') || t.has('electronics_store') || t.has('furniture_store') ||
    t.has('home_goods_store') || t.has('pet_store') || t.has('book_store')
  ) return 'RETAIL_STORE';

  // Hospitality
  if (t.has('lodging') || t.has('hotel')) return 'HOSPITALITY';

  // Health
  if (t.has('hospital') || t.has('pharmacy') || t.has('health')) return 'HEALTH';

  // Automotive
  if (t.has('car_repair') || t.has('car_dealer') || t.has('gas_station')) return 'AUTOMOTIVE';

  // Education
  if (t.has('school') || t.has('university')) return 'EDUCATION';

  return 'OTHER';
}

function suggestCapabilities(category: BusinessCategory) {
  // Flags genéricas e escaláveis
  const base = {
    show_hours: true,
    show_location: true,
    show_contact: true,
    accept_questions: true,
    accept_orders: false,
    accept_bookings: false,
    accept_complaints: false,
    accept_requests: false, // pedidos formais/serviço
  };

  if (category === 'FOOD_SERVICE') {
    return { ...base, accept_orders: true, accept_bookings: true };
  }
  if (category === 'APPOINTMENT_BASED') {
    return { ...base, accept_bookings: true };
  }
  if (category === 'RETAIL_STORE') {
    return { ...base, accept_orders: true };
  }
  if (category === 'PUBLIC_SERVICE') {
    return { ...base, accept_complaints: true, accept_requests: true };
  }
  return base;
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

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
    placeId
  )}&fields=${encodeURIComponent(fields)}&language=pt-PT&key=${encodeURIComponent(key)}`;

  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}`);
  }
  if (json.status !== 'OK') {
    throw new Error(`Google Places error: ${json.status}${json.error_message ? ` - ${json.error_message}` : ''}`);
  }
  return json.result;
}

export async function POST(req: Request) {
  try {
    // Auth: server-to-server API key
    if (!isValidApiKey(req)) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const client_id = Number(body.client_id);
    const maps_url_raw = String(body.maps_url || '');

    if (!client_id || !maps_url_raw) {
      return NextResponse.json(
        { ok: false, error: 'client_id e maps_url são obrigatórios' },
        { status: 400 }
      );
    }

    const maps_url = normalizeMapsUrl(maps_url_raw);
    const finalUrl = await resolveRedirect(maps_url);

    const placeId = extractPlaceIdFromUrl(finalUrl) || extractPlaceIdFromUrl(maps_url);
    if (!placeId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Não consegui extrair place_id do link.',
          hint: 'Tenta colar o link completo do Google Maps (não o curto do maps.app.goo.gl).',
          debug: { maps_url, finalUrl },
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
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 });
    }

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
    return NextResponse.json(
      { ok: false, error: err?.message || 'Erro interno' },
      { status: 500 }
    );
  }
}