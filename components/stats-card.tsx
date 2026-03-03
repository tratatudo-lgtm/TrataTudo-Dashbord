import React from "react";

type StatsColor =
  | "blue"
  | "green"
  | "amber"
  | "red"
  | "indigo"
  | "purple"
  | "slate";

export type StatsCardProps = {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  /** Opcional: se não vier, usamos "indigo" */
  color?: StatsColor;
};

const COLOR_STYLES: Record<StatsColor, { bg: string; text: string; ring: string }> = {
  blue:   { bg: "bg-blue-50",   text: "text-blue-700",   ring: "ring-blue-200" },
  green:  { bg: "bg-green-50",  text: "text-green-700",  ring: "ring-green-200" },
  amber:  { bg: "bg-amber-50",  text: "text-amber-700",  ring: "ring-amber-200" },
  red:    { bg: "bg-red-50",    text: "text-red-700",    ring: "ring-red-200" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-700", ring: "ring-indigo-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", ring: "ring-purple-200" },
  slate:  { bg: "bg-slate-50",  text: "text-slate-700",  ring: "ring-slate-200" },
};

export default function StatsCard({ title, value, icon: Icon, color = "indigo" }: StatsCardProps) {
  const c = COLOR_STYLES[color] ?? COLOR_STYLES.indigo;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        </div>

        <div className={`shrink-0 rounded-xl ${c.bg} ${c.text} ring-1 ${c.ring} p-2`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}