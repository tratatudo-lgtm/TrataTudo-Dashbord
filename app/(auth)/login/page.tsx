import { Suspense } from 'react';
import LoginClient from './login-client';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">A carregar...</div>}>
      <LoginClient />
    </Suspense>
  );
}
