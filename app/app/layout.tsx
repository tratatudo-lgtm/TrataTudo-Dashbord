import { Sidebar } from '@/components/sidebar';
import { NotificationProvider } from '@/components/notification-provider';
import { NotificationCenter } from '@/components/notification-center';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NotificationProvider>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-end px-8 gap-4">
            <NotificationCenter />
            <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
              AD
            </div>
          </header>
          <main className="flex-1 p-8 overflow-y-auto">{children}</main>
        </div>
      </div>
    </NotificationProvider>
  );
}

