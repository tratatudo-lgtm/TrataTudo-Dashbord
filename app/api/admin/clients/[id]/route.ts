import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { normalizeE164 } from '@/lib/phone';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Admin Clients GET ID Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();

    if (body.phone_e164) {
      const normalized = normalizeE164(body.phone_e164);
      if (!normalized) {
        return NextResponse.json({ error: 'Formato de telefone inválido' }, { status: 400 });
      }
      body.phone_e164 = normalized;
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('clients')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Admin Clients PATCH Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
