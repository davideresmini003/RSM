import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { SectionTitle, EmptyState, SkeletonRow } from "../components/ui-bits";
import { Lock } from "lucide-react";

export default function OperationsList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get("/operations").then(({ data }) => setOps(data.operations || [])).finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="operations-list-page">
      <div className="overline">{t("ops_list.title")}</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">{t("ops_list.subtitle")}</h1>
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : ops.length === 0 ? (
        <EmptyState>
          <div className="flex flex-col items-center gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
              <rect x="3" y="3" width="18" height="18" rx="0" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            <h3 className="font-display text-lg font-semibold text-[#0B132B]" data-testid="ops-empty-title">{t("ops_list.empty_title")}</h3>
            <p className="text-sm text-slate-500 max-w-md text-center">
              {user?.role === "cedente" && t("ops_list.empty_desc_cedente")}
              {user?.role === "reasegurador" && t("ops_list.empty_desc_reasegurador")}
              {user?.role === "broker" && t("ops_list.empty_desc_broker")}
              {user?.role === "admin" && t("ops_list.empty_desc_admin")}
            </p>
          </div>
        </EmptyState>
      ) : (
        <div className="border border-[hsl(var(--border))] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="text-left px-4 py-3 overline">{t("ops_list.col_code")}</th>
                <th className="text-left px-4 py-3 overline">{t("ops_list.col_counterpart")}</th>
                <th className="text-left px-4 py-3 overline">{t("ops_list.col_status")}</th>
                <th className="text-left px-4 py-3 overline">{t("ops_list.col_date")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ops.map((op) => {
                const counter = (() => {
                  if (user.role === "cedente") return op.revealed ? op.reasegurador_name : "Reasegurador anónimo";
                  if (user.role === "reasegurador") return op.revealed ? op.cedente_name : "Cedente anónimo";
                  if (user.role === "broker") return op.revealed ? `${op.cedente_name} · ${op.reasegurador_name}` : "Partes anónimas";
                  return `${op.cedente_name} · ${op.reasegurador_name}`;
                })();
                return (
                  <tr key={op.id} className="border-b border-[hsl(var(--border))] hover:bg-[#F8FAFC] transition-colors" data-testid={`op-${op.id}`}>
                    <td className="px-4 py-3 font-mono-data font-semibold">{op.code}</td>
                    <td className="px-4 py-3 flex items-center gap-2">{!op.revealed && <Lock size={12} className="text-slate-400" strokeWidth={1.5} />}{counter}</td>
                    <td className="px-4 py-3"><span className="overline">{t(`operation.states.${op.state}`) || op.state.replace("_", " ")}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(op.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/app/operations/${op.id}`} className="overline text-[#0B132B] hover:text-[#D32F2F]">{t("common.view")} →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
