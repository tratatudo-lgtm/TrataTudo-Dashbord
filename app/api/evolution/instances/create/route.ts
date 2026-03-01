import { createClient } from '@/lib/supabase/server';
import { createEvolutionInstance } from '@/lib/evolution';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const { clientId, instanceName, phone } = await request.json();
    
    if (!instanceName || !phone) {
      throw new Error('Nome da instância e telefone são obrigatórios');
    }

    // 1. Criar na Evolution API
    const evolutionData = await createEvolutionInstance(instanceName, phone);

    // 2. Atualizar status no Supabase para 'active'
    const { error: updateError } = await supabase
      .from('clients')
      .update({ 
        status: 'active',
        instance_name: instanceName,
        evolution_data: evolutionData 
      })
      .eq('id', clientId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, evolutionData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
