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

function normalizeMapsUrl(input: string) {
  if (!input) return '';
  if (input.startsWith('http')) return input;
  return `https://${input}`;
}

async function resolveRedirect(url: string) {
  const res = await fetch(url, { redirect: 'follow' });
  return res.url || url;
}

function extractPlaceIdFromUrl(urlStr: string): string | null {
  const match = urlStr.match(/(ChI[a-zA-Z0-9_-]{10,})/);
  return match?.[1] || null;
}

/* ============================
   🔥 CLASSIFICAÇÃO INTELIGENTE
============================ */

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

  if (t.has('local_government_office') || t.has('city_hall') || t.has('government_office'))
    return 'PUBLIC_SERVICE';

  if (t.has('restaurant') || t.has('cafe') || t.has('bar'))
    return 'FOOD_SERVICE';

  if (t.has('hair_care') || t.has('beauty_salon') || t.has('spa'))
    return 'APPOINTMENT_BASED';

  if (t.has('store') || t.has('supermarket') || t.has('hardware_store'))
    return 'RETAIL_STORE';

  if (t.has('lodging') || t.has('hotel'))
    return 'HOSPITALITY';

  if (t.has('hospital') || t.has('pharmacy'))
    return 'HEALTH';

  if (t.has('car_repair') || t.has('gas_station'))
    return 'AUTOMOTIVE';

  if (t.has('school') || t.has('university'))
    return 'EDUCATION';

  return 'OTHER';
}

/* ============================
   🔥 OVERRIDE POR NOME
============================ */

function classifyByNameFallback(name: string, current: BusinessCategory): BusinessCategory {
  if (!name) return current;

  const n = name.toLowerCase();

  if (
    n.includes('união das freguesias') ||
    n.includes('junta de freguesia') ||
    n.includes('câmara municipal') ||
    n.includes('município') ||
    n.includes('serviços municipal')
  ) {
    return 'PUBLIC_SERVICE';
  }

  return current;
}

/* ============================
   🔥 CAPABILITIES
============================ */

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

  if (category === 'FOOD_SERVICE')
    return { ...base, accept_orders: true, accept_bookings: true };

  if (category === 'APPOINTMENT_BASED')
    return { ...base, accept_bookings: true };

  if (category === 'RETAIL_STORE')
    return { ...base, accept_orders: true };

  if (category === 'PUBLIC_SERVICE')
    return {
      ...base,
      accept_complaints: true,
      accept_requests: true,
    };

  return base;
}

/* ============================
   🔥 GOOGLE DETAILS
============================ */

async function fetchPlaceDetails(placeId: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error('Missing GOOGLE_PLACES_API_KEY');

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=place_id,name,formatted_address,formatted_phone_number,website,opening_hours,types,rating,user_ratings_total` +
    `&language=pt-PT` +
    `&key=${key}`;

  const res = await fetch(url, { cache: 'no-store' });
  const json = await res.json();

  if (!res.ok || json.status !== 'OK') {
    throw new Error(`Google Places error: ${json.status}`);
  }

  return json.result;
}

/* ============================
   🚀 MAIN
============================ */

export async function POST(req: Request) {
  try {
    if (!isValidApiKey(req))
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const client_id = Number(body.client_id);
    const maps_url = normalizeMapsUrl(body.maps_url);

    if (!client_id || !maps_url)
      return NextResponse.json({ ok: false, error: 'client_id e maps_url são obrigatórios' }, { status: 400 });

    const finalUrl = await resolveRedirect(maps_url);
    const placeId = extractPlaceIdFromUrl(finalUrl);

    if (!placeId)
      return NextResponse.json({ ok: false, error: 'Não consegui extrair place_id' }, { status: 400 });

    const place = await fetchPlaceDetails(placeId);

    let category = classifyBusiness(place.types || []);
    category = classifyByNameFallback(place.name, category);

    const capabilities = suggestCapabilities(category);

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
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
      .select('*')
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: {
        client: data,
        summary: {
          name: place.name,
          address: place.formatted_address,
          category,
          capabilities,
        },
      },
    });
  } catch (err: any) {
    console.error('Places Lookup Error:', err);
    return NextResponse.json({ ok: false, error: err.message || 'Erro interno' }, { status: 500 });
  }
}