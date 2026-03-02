import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function validateAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { isAdmin: false, error: 'Não autenticado', status: 401 };
  }

  const adminClient = createAdminClient();
  const { data: admin, error: adminError } = await adminClient
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  if (adminError) {
    console.error('Admin Validation Error:', adminError);
    if (adminError.code === 'PGRST116') {
      return { isAdmin: false, error: 'Acesso negado: Não é administrador', status: 403 };
    }
    return { isAdmin: false, error: `Erro ao validar admin: ${adminError.message}`, status: 500 };
  }

  return { isAdmin: true, user };
}
