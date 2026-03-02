import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  color: 'emerald' | 'indigo' | 'rose' | 'blue' | 'amber';
  trend?: string;
}

export function StatsCard({ title, value, icon: Icon, color, trend }: StatsCardProps) {
  const colorClasses = {
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
  };

  const iconBgClasses = {
    emerald: 'bg-emerald-100',
    indigo: 'bg-indigo-100',
    rose: 'bg-rose-100',
    blue: 'bg-blue-100',
    amber: 'bg-amber-100',
  };

  return (
    <div className={`p-6 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition group`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`p-3 rounded-xl ${iconBgClasses[color]} ${colorClasses[color].split(' ')[1]} group-hover:scale-110 transition-transform`}>
          <Icon className="h-6 w-6" />
        </div>
        {trend && (
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <h3 className="text-3xl font-bold text-slate-900 mt-1">{value}</h3>
      </div>
    </div>
  );
}
