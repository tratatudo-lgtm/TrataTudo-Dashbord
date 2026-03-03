import { createClient } from '@/lib/supabase/server';

export async function getSystemBasePrompt(): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'SYSTEM_BASE_PROMPT')
    .maybeSingle();

  if (error) {
    console.error('getSystemBasePrompt error:', error);
    return '';
  }
  return (data?.value as string) || '';
}

export function mergePrompts(systemBase: string, clientPrompt: string) {
  const base = (systemBase || '').trim();
  const client = (clientPrompt || '').trim();

  if (!base && !client) return '';
  if (!base) return client;
  if (!client) return base;
  return `${base}\n\n${client}`;
}