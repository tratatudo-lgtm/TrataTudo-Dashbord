import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const query = searchParams.get('q');

    const supabase = createAdminClient();
    let dbQuery = supabase.from('clients').select('*');

    if (status && status !== 'all') {
      dbQuery = dbQuery.eq('status', status);
    }

    if (query) {
      dbQuery = dbQuery.or(`company_name.ilike.%${query}%,phone_e164.ilike.%${query}%`);
    }

    const { data, error } = await dbQuery.order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error('API Admin Clients GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('clients')
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('API Admin Clients POST Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
