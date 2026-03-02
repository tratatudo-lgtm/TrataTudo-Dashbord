import { NextResponse } from 'next/server';
import { getPlaceDetails } from '@/lib/places';

export async function POST(request: Request) {
  try {
    const { input } = await request.json();
    if (!input) return NextResponse.json({ error: 'Input é obrigatório' }, { status: 400 });

    const { result: details, logs } = await getPlaceDetails(input);

    return NextResponse.json({
      place_id: details.place_id,
      name: details.name,
      address: details.formatted_address,
      website: details.website,
      phone: details.formatted_phone_number || details.international_phone_number,
      types: details.types,
      logs
    });

  } catch (error: any) {
    console.error('API Places Resolve Error:', error.message);
    
    // Check if error is a JSON diagnostic
    try {
      const diag = JSON.parse(error.message);
      if (diag.status === 'REQUEST_DENIED') {
        return NextResponse.json({ 
          error: 'Acesso Negado à Google Places API',
          diagnostics: diag
        }, { status: 403 });
      }
    } catch (e) {
      // Not a JSON error
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
