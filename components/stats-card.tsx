import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: 'emerald' | 'indigo' | 'rose' | 'amber';
}

const colorMap = {
  emerald: 'bg-emerald-50 border-emerald-100',
  indigo: 'bg-indigo-50 border-indigo-100',
  rose: 'bg-rose-50 border-rose-100',
  amber: 'bg-amber-50 border-amber-100',
};

export function StatsCard({ title, value, icon, color }: StatsCardProps) {
  return (
    <div className={cn('rounded-2xl border p-6 shadow-sm transition hover:shadow-md', colorMap[color])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div className="rounded-xl bg-white p-3 shadow-sm">{icon}</div>
      </div>
    </div>
  );
}
