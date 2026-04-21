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

export function KPICard({ label, value, accent = false, testid }) {
  return (
    <div className="rsm-card rsm-card-hover" data-testid={testid}>
      <div className="overline">{label}</div>
      <div className={`mt-3 font-mono-data font-semibold text-3xl ${accent ? "text-[#D32F2F]" : "text-[#0B132B]"}`}>
        {value ?? "—"}
      </div>
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
    <div className="text-center py-12 text-slate-400 text-sm">
      {children}
    </div>
  );
}
