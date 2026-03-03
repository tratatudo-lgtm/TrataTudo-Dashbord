import React from "react";

export type StatsColor =
  | "blue"
  | "green"
  | "emerald"
  | "amber"
  | "red"
  | "rose"
  | "indigo"
  | "purple"
  | "slate";

export type StatsCardProps = {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  /** ✅ opcional para não rebentar páginas antigas */
  color?: StatsColor;
  trend?: string;
};

const COLOR_STYLES: Record<StatsColor, { chipBg: string; chipText: string; ring: string }> = {
  blue:    { chipBg: "bg-blue-50",    chipText: "text-blue-700",    ring: "ring-blue-200" },
  green:   { chipBg: "bg-green-50",   chipText: "text-green-700",   ring: "ring-green-200" },
  emerald: { chipBg: "bg-emerald-50", chipText: "text-emerald-700", ring: "ring-emerald-200" },
  amber:   { chipBg: "bg-amber-50",   chipText: "text-amber-700",   ring: "ring-amber-200" },
  red:     { chipBg: "bg-red-50",     chipText: "text-red-700",     ring: "ring-red-200" },
  rose:    { chipBg: "bg-rose-50",    chipText: "text-rose-700",    ring: "ring-rose-200" },
  indigo:  { chipBg: "bg-indigo-50",  chipText: "text-indigo-700",  ring: "ring-indigo-200" },
  purple:  { chipBg: "bg-purple-50",  chipText: "text-purple-700",  ring: "ring-purple-200" },
  slate:   { chipBg: "bg-slate-50",   chipText: "text-slate-700",   ring: "ring-slate-200" },
};

// ✅ named export (para: import { StatsCard } from '@/components/stats-card')
export function StatsCard({ title, value, icon: Icon, color = "indigo", trend }: StatsCardProps) {
  const c = COLOR_STYLES[color] ?? COLOR_STYLES.indigo;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {trend ? <p className="mt-1 text-xs text-slate-500">{trend}</p> : null}
        </div>

        <div className={`shrink-0 rounded-2xl ${c.chipBg} ${c.chipText} ring-1 ${c.ring} p-3`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

// ✅ default export (para: import StatsCard from '@/components/stats-card')
export default StatsCard;