import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('Supabase env vars missing. Client will fail on actual requests.');
  }

  return createBrowserClient(
    url || 'https://placeholder.supabase.co',
    key || 'placeholder'
  );
}
