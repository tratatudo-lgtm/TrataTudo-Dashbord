import { Sidebar } from '@/components/sidebar';
import { NotificationProvider } from '@/components/notification-provider';
import { NotificationCenter } from '@/components/notification-center';
import { createClient } from '@/lib/supabase/server';
import { LogOut, User } from 'lucide-react';
import Link from 'next/link';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <NotificationProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 gap-4 sticky top-0 z-10">
            <div className="flex items-center gap-4 lg:hidden">
              {/* Mobile menu button could go here if sidebar was hidden */}
            </div>
            
            <div className="flex-1" />

            <div className="flex items-center gap-4">
              <NotificationCenter />
              <div className="h-px w-4 bg-slate-200 rotate-90" />
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">{user?.email}</p>
                  <p className="text-xs text-slate-500">Administrador</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {user?.email?.[0].toUpperCase() || <User className="h-5 w-5" />}
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-8 overflow-y-auto">{children}</main>
        </div>
      </div>
    </NotificationProvider>
  );
}

