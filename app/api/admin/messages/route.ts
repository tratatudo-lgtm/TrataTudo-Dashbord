import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem ver mensagens.' }, { status: authStatus });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    const supabase = createAdminClient();
    
    // Attempt to select all columns, but we'll be careful with the schema
    // We'll try to detect which columns exist by doing a limited select first or just handling the error
    let dbQuery = supabase.from('messages').select('*', { count: 'exact' });

    if (phone) {
      // Try to filter by 'phone' or 'from_number' or 'to_number'
      dbQuery = dbQuery.or(`phone.eq.${phone},from_number.eq.${phone},to_number.eq.${phone}`);
    }

    const { data, error, count } = await dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase Messages Error:', error);
      // Fallback: try to select only columns we are reasonably sure about
      // We'll try common variations
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('messages')
        .select('id, created_at, direction')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (fallbackError) throw fallbackError;
      
      // If we got here, at least id, created_at, direction exist.
      // Now let's try to add text/body and phone/from_number
      return NextResponse.json({ 
        messages: fallbackData.map((m: any) => ({
          ...m,
          text: m.text || m.body || m.content || 'Conteúdo indisponível',
          phone: m.phone || m.from_number || m.sender || 'Desconhecido'
        })), 
        count: fallbackData.length,
        schema_warning: 'Algumas colunas podem estar em falta na tabela "messages".'
      });
    }

    // Map data to ensure consistent field names for the UI
    const mappedMessages = data?.map((m: any) => ({
      ...m,
      text: m.text || m.body || m.content || '',
      phone: m.phone || m.from_number || m.sender || '',
      to_number: m.to_number || m.receiver || ''
    })) || [];

    return NextResponse.json({ messages: mappedMessages, count: count || 0 });
  } catch (error: any) {
    console.error('API Admin Messages GET Error:', error);
    return NextResponse.json({ ok: false, error: error.message, hint: 'Verifique se a tabela "messages" existe e tem as colunas corretas.' }, { status: 500 });
  }
}
