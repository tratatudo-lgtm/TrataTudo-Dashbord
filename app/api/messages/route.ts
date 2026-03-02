import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    // 1. Validate Admin
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError }, { status: authStatus });
    }

    // 2. Parse Query Params
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const clientId = searchParams.get('client_id');
    const query = searchParams.get('q');
    const direction = searchParams.get('direction');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();
    
    // 3. Determine Table Name (messages or wa_messages)
    // We'll try 'messages' first, then 'wa_messages'
    let tableName = 'messages';
    
    // Check if table exists by doing a small select
    const { error: checkError } = await supabase.from(tableName).select('id').limit(1);
    if (checkError && (checkError.code === '42P01' || checkError.message.includes('does not exist'))) {
      tableName = 'wa_messages';
    }

    // 4. Build Query
    let dbQuery = supabase.from(tableName).select('*', { count: 'exact' });

    if (phone) {
      dbQuery = dbQuery.or(`phone.eq.${phone},from_number.eq.${phone},to_number.eq.${phone},remote_jid.ilike.%${phone}%`);
    }

    if (clientId) {
      dbQuery = dbQuery.eq('client_id', clientId);
    }

    if (direction && direction !== 'all') {
      dbQuery = dbQuery.eq('direction', direction);
    }

    if (query) {
      // Try common text columns
      dbQuery = dbQuery.or(`text.ilike.%${query}%,body.ilike.%${query}%,content.ilike.%${query}%`);
    }

    // 5. Execute Query
    const { data, error, count } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`Supabase ${tableName} Error:`, error);
      throw error;
    }

    // 6. Map Data for UI Consistency
    const mappedMessages = data?.map((m: any) => ({
      id: m.id,
      created_at: m.created_at || m.timestamp || new Date().toISOString(),
      direction: m.direction || 'in',
      text: m.text || m.body || m.content || m.message || '',
      phone: m.phone || m.from_number || m.sender || m.remote_jid?.split('@')[0] || 'Desconhecido',
      instance_name: m.instance_name || m.instance || '',
      client_id: m.client_id || ''
    })) || [];

    return NextResponse.json({ ok: true, messages: mappedMessages, count: count || 0 });
  } catch (error: any) {
    console.error('API Messages GET Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Erro interno ao buscar mensagens',
      hint: 'Verifique se a tabela "messages" ou "wa_messages" existe no Supabase.'
    }, { status: 500 });
  }
}
