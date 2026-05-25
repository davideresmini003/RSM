import React from "react";
import { Lock, CheckCircle2, Clock, ShieldCheck } from "lucide-react";

export function VerifiedBadge({ children = "VERIFICADO" }) {
  return (
    <span className="badge-verified" data-testid="badge-verified">
      <ShieldCheck size={10} strokeWidth={2} /> {children}
    </span>
  );
}

export function AnonBadge({ children = "ANÓNIMO" }) {
  return (
    <span className="badge-anon" data-testid="badge-anon">
      <Lock size={10} strokeWidth={2} /> {children}
    </span>
  );
}

export function PendingBadge({ children = "PENDIENTE" }) {
  return (
    <span className="badge-pending">
      <Clock size={10} strokeWidth={2} /> {children}
    </span>
  );
}

export function LossRatioPill({ value }) {
  if (value == null) return <span className="font-mono-data text-slate-400">—</span>;
  let color = "#991B1B";
  let bg = "#FEF2F2";
  if (value < 65) { color = "#065F46"; bg = "#ECFDF5"; }
  else if (value < 80) { color = "#92400E"; bg = "#FFFBEB"; }
  return (
    <span className="inline-flex items-center gap-1 font-mono-data text-xs font-semibold px-2 py-0.5" style={{ background: bg, color }}>
      LR {value}%
    </span>
  );
}

export function KPICard({ label, value, sub, accent = false, testid }) {
  return (
    <div className="rsm-card rsm-card-hover" data-testid={testid}>
      <div className="overline">{label}</div>
      <div className={`mt-3 font-mono-data font-semibold text-3xl ${accent ? "text-[#D32F2F]" : "text-[#0B132B]"}`}>
        {value ?? "—"}
      </div>
      {sub != null && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, actions }) {
  return (
    <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4 mb-6">
      <h2 className="font-display text-2xl font-semibold text-[#0B132B]">{children}</h2>
      {actions}
    </div>
  );
}

export function EmptyState({ children }) {
  return (
    <div className="text-center py-12 text-slate-400 text-sm flex flex-col items-center gap-1">
      {children}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rsm-card animate-pulse">
      <div className="flex justify-between">
        <div className="h-3 bg-slate-200 rounded w-20" />
        <div className="h-3 bg-slate-200 rounded w-16" />
      </div>
      <div className="h-5 bg-slate-200 rounded w-3/4 mt-4" />
      <div className="mt-4 pt-4 border-t border-[hsl(var(--border))] space-y-2">
        <div className="flex justify-between"><div className="h-2.5 bg-slate-100 rounded w-16" /><div className="h-2.5 bg-slate-200 rounded w-20" /></div>
        <div className="flex justify-between"><div className="h-2.5 bg-slate-100 rounded w-16" /><div className="h-2.5 bg-slate-200 rounded w-24" /></div>
        <div className="flex justify-between"><div className="h-2.5 bg-slate-100 rounded w-16" /><div className="h-2.5 bg-slate-200 rounded w-16" /></div>
        <div className="flex justify-between"><div className="h-2.5 bg-slate-100 rounded w-16" /><div className="h-2.5 bg-slate-200 rounded w-12" /></div>
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="rsm-card animate-pulse flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-3 bg-slate-200 rounded w-24" />
        <div className="h-2.5 bg-slate-100 rounded w-36" />
      </div>
      <div className="h-3 bg-slate-200 rounded w-20" />
    </div>
  );
}

export function Tooltip({ children, content }) {
  return (
    <span className="relative group inline-flex items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-[#0B132B] text-white text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-50 text-center leading-snug">
        {content}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#0B132B]" />
      </span>
    </span>
  );
}
