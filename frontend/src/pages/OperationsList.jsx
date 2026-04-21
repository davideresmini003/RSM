import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { SectionTitle, EmptyState } from "../components/ui-bits";
import { Lock } from "lucide-react";

export default function OperationsList() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [ops, setOps] = useState([]);
  useEffect(() => {
    api.get("/operations").then(({ data }) => setOps(data.operations || []));
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="operations-list-page">
      <div className="overline">Operaciones</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">Todas las operaciones</h1>
      {ops.length === 0 ? <EmptyState>Sin operaciones todavía.</EmptyState> : (
        <div className="border border-[hsl(var(--border))] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="text-left px-4 py-3 overline">Código</th>
                <th className="text-left px-4 py-3 overline">Contraparte</th>
                <th className="text-left px-4 py-3 overline">Estado</th>
                <th className="text-left px-4 py-3 overline">Fecha</th>
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
                    <td className="px-4 py-3"><span className="overline">{op.state.replace("_", " ")}</span></td>
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
