import { createClient } from '@/lib/supabase/server';
import { getPlaceDetails, fetchWebsiteText } from '@/lib/places';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const { url } = await request.json();
    if (!url) throw new Error('URL do Google Maps é obrigatória');

    const details = await getPlaceDetails(url);
    let websiteText = '';
    
    if (details.website) {
      websiteText = await fetchWebsiteText(details.website);
    }

    return NextResponse.json({
      name: details.name,
      category: details.types?.[0] || '',
      address: details.formatted_address,
      phone: details.formatted_phone_number,
      hours: details.opening_hours?.weekday_text?.join('\n') || '',
      website: details.website,
      rating: details.rating,
      reviewsSummary: details.reviews?.map((r: any) => r.text).join('\n').substring(0, 1000) || '',
      websiteText
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
