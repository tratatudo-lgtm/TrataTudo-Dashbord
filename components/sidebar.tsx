'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  MessageSquare, 
  Settings, 
  LogOut,
  Bot,
  Zap
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useNotifications } from './notification-provider';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { name: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { name: 'Clientes', href: '/app/clients', icon: Users },
  { name: 'Mensagens', href: '/app/messages', icon: MessageSquare },
  { name: 'Configurações', href: '/app/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { addNotification } = useNotifications();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const simulateTrialEnd = () => {
    addNotification({
      title: 'Trial a Terminar',
      message: 'O trial do cliente "João Silva" termina em 24 horas. Contacte-o para conversão.',
      type: 'warning'
    });
  };

  const simulateApiError = () => {
    addNotification({
      title: 'Erro na Evolution API',
      message: 'A instância "Bot-01" perdeu a ligação. Verifique o estado do servidor.',
      type: 'error'
    });
  };

  return (
    <aside className="flex w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-20 items-center px-6">
        <Bot className="mr-3 h-8 w-8 text-indigo-600" />
        <span className="text-xl font-bold text-slate-900">TrataTudo</span>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5',
                  isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-500'
                )}
              />
              {item.name}
            </Link>
          );
        })}

        <div className="pt-4 pb-2 px-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Simulação</p>
        </div>
        
        <button
          onClick={simulateTrialEnd}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-amber-50 hover:text-amber-700"
        >
          <Zap className="mr-3 h-4 w-4 text-amber-500" />
          Fim de Trial
        </button>
        
        <button
          onClick={simulateApiError}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700"
        >
          <Zap className="mr-3 h-4 w-4 text-red-500" />
          Erro de API
        </button>
      </nav>

      <div className="border-t border-slate-200 p-4">

        <button
          onClick={handleLogout}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-rose-50 hover:text-rose-700"
        >
          <LogOut className="mr-3 h-5 w-5 text-slate-400 group-hover:text-rose-600" />
          Sair
        </button>
      </div>
    </aside>
  );
}
