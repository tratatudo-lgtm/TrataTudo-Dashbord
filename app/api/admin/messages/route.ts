import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const instance = searchParams.get('instance');
    const direction = searchParams.get('direction');
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '50');
    const page = parseInt(searchParams.get('page') || '1');

    const supabase = createAdminClient();
    let dbQuery = supabase.from('messages').select('*', { count: 'exact' });

    if (phone) dbQuery = dbQuery.eq('phone', phone);
    if (instance) dbQuery = dbQuery.eq('instance_name', instance);
    if (direction && direction !== 'all') dbQuery = dbQuery.eq('direction', direction);
    if (query) dbQuery = dbQuery.ilike('text', `%${query}%`);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await dbQuery
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return NextResponse.json({
      messages: data || [],
      count: count || 0
    });
  } catch (error: any) {
    console.error('API Admin Messages GET Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
