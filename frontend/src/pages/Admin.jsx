import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { VerifiedBadge, PendingBadge } from "../components/ui-bits";

export default function Admin() {
  const { t } = useI18n();
  const [tab, setTab] = useState("companies");
  const [companies, setCompanies] = useState([]);
  const [audit, setAudit] = useState([]);

  const load = () => {
    api.get("/admin/companies").then(({ data }) => setCompanies(data.companies || []));
    api.get("/admin/audit").then(({ data }) => setAudit(data.items || []));
  };
  useEffect(() => { load(); }, []);

  const verify = async (company_id, verified) => {
    await api.post("/admin/companies/verify", { company_id, verified });
    load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="admin-page">
      <div className="overline">Admin</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">{t("admin.title")}</h1>

      <div className="flex border-b border-[hsl(var(--border))] mb-6">
        <button onClick={() => setTab("companies")} className={`px-6 py-3 text-xs uppercase tracking-wider font-semibold ${tab === "companies" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} data-testid="admin-tab-companies">{t("admin.companies")}</button>
        <button onClick={() => setTab("audit")} className={`px-6 py-3 text-xs uppercase tracking-wider font-semibold ${tab === "audit" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} data-testid="admin-tab-audit">{t("admin.audit_log")}</button>
      </div>

      {tab === "companies" && (
        <div className="border border-[hsl(var(--border))] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="text-left px-4 py-3 overline">Empresa</th>
                <th className="text-left px-4 py-3 overline">Rol</th>
                <th className="text-left px-4 py-3 overline">NIF</th>
                <th className="text-left px-4 py-3 overline">País</th>
                <th className="text-left px-4 py-3 overline">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-[hsl(var(--border))]" data-testid={`company-${c.id}`}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 overline">{c.role}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{c.tax_id}</td>
                  <td className="px-4 py-3 text-xs">{c.country}</td>
                  <td className="px-4 py-3">{c.verified ? <VerifiedBadge /> : <PendingBadge />}</td>
                  <td className="px-4 py-3 text-right">
                    {c.verified ? (
                      <button className="rsm-btn-danger" onClick={() => verify(c.id, false)} data-testid={`unverify-${c.id}`}>{t("admin.unverify")}</button>
                    ) : (
                      <button className="rsm-btn-primary text-xs" onClick={() => verify(c.id, true)} data-testid={`verify-${c.id}`}>{t("admin.verify")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="border border-[hsl(var(--border))] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="text-left px-4 py-3 overline">Fecha</th>
                <th className="text-left px-4 py-3 overline">Acción</th>
                <th className="text-left px-4 py-3 overline">Usuario</th>
                <th className="text-left px-4 py-3 overline">Target</th>
                <th className="text-left px-4 py-3 overline">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-[hsl(var(--border))]">
                  <td className="px-4 py-3 font-mono-data text-xs">{new Date(a.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 overline">{a.action}</td>
                  <td className="px-4 py-3 text-xs">{a.user_email} · {a.user_role}</td>
                  <td className="px-4 py-3 text-xs font-mono-data">{a.target_type}:{a.target_id?.slice(0, 8)}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{a.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
