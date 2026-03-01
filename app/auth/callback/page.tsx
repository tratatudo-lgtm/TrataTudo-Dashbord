'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleAuthCallback = async () => {
      // Supabase sends tokens in the hash: #access_token=...&refresh_token=...&type=recovery
      const hash = window.location.hash;
      if (!hash) {
        router.replace('/login');
        return;
      }

      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error('Error setting session:', error.message);
          router.replace('/login?error=session_failed');
          return;
        }

        // Clear hash from URL
        window.history.replaceState(null, '', window.location.pathname);

        if (type === 'recovery') {
          router.replace('/reset-password');
        } else {
          router.replace('/app');
        }
      } else {
        router.replace('/login');
      }
    };

    handleAuthCallback();
  }, [router, supabase.auth]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent mx-auto"></div>
        <h1 className="text-xl font-semibold text-slate-900">A iniciar sessão...</h1>
        <p className="text-slate-500">Por favor, aguarde um momento.</p>
      </div>
    </div>
  );
}
