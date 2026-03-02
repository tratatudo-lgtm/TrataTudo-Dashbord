import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { validateAdmin } from '@/lib/auth-admin';

export async function POST(request: Request) {
  try {
    const { isAdmin, error: authError, status: authStatus } = await validateAdmin();
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: authError, hint: 'Apenas administradores podem ativar planos.' }, { status: authStatus });
    }

    const { client_id } = await request.json();
    if (!client_id) return NextResponse.json({ ok: false, error: 'client_id é obrigatório' }, { status: 400 });

    const supabase = createAdminClient();

    // 1. Get client
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    let instanceName = client.instance_name;

    // 2. Create instance if needed
    if (!instanceName || instanceName === 'trial' || instanceName.trim() === '') {
      const slug = client.company_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 15);
      
      instanceName = `tt_${slug}_${client_id.slice(0, 4)}`;

      console.log(`Creating Evolution instance: ${instanceName}`);
      
      const evoUrl = process.env.EVOLUTION_API_URL;
      const evoKey = process.env.EVOLUTION_API_KEY;

      if (!evoUrl || !evoKey) {
        throw new Error('Evolution API não configurada (URL/KEY)');
      }

      const createRes = await fetch(`${evoUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evoKey
        },
        body: JSON.stringify({
          instanceName: instanceName,
          token: Math.random().toString(36).substring(7),
          qrcode: true
        })
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        console.error('Evolution Create Instance Error:', createData);
        // If instance already exists, we might want to continue, but for now let's throw
        if (createData.response?.message?.includes('already exists')) {
           // Continue if it already exists
        } else {
          throw new Error(`Erro ao criar instância na Evolution: ${createData.response?.message || createRes.statusText}`);
        }
      }
    }

    // 3. Update client status
    const { error: updateError } = await supabase
      .from('clients')
      .update({
        instance_name: instanceName,
        status: 'active',
        trial_ends_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', client_id);

    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, instance_name: instanceName });

  } catch (error: any) {
    console.error('API Admin Subscribe Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
