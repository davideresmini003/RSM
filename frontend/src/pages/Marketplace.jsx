import React, { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { PackCard } from "./Dashboard";
import { Search } from "lucide-react";

const BRANCHES = ["", "Property", "Casualty", "Marina", "Aviación", "Vida", "Salud", "Motor", "RC", "Ingeniería", "Agricultura", "Crédito", "Otro"];
const TYPES = ["", "Excess of Loss", "Quota Share", "Surplus", "Proporcional", "No proporcional", "Facultativo", "Treaty"];

export default function Marketplace() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [packs, setPacks] = useState([]);
  const [filters, setFilters] = useState({ branch: "", reinsurance_type: "", country: "", verified_only: false, has_broker: "all", search: "" });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ open: false, pack: null, message: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (filters.branch) params.branch = filters.branch;
    if (filters.reinsurance_type) params.reinsurance_type = filters.reinsurance_type;
    if (filters.country) params.country = filters.country;
    if (filters.verified_only) params.verified_only = true;
    if (filters.has_broker !== "all") params.has_broker = filters.has_broker;
    if (filters.search) params.search = filters.search;
    try {
      const { data } = await api.get("/marketplace/packs", { params });
      setPacks(data.packs || []);
    } finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const expressInterest = async () => {
    try {
      await api.post("/interests", { pack_id: msg.pack.id, message: msg.message });
      setMsg({ open: false, pack: null, message: "" });
      load();
    } catch (e) {
      alert(e.response?.data?.detail || e.message);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="marketplace-page">
      <div className="overline">Marketplace</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">{t("marketplace.title")}</h1>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
        <aside className="space-y-5">
          <div>
            <label className="rsm-label">{t("common.search")}</label>
            <div className="relative">
              <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="rsm-input pl-9" placeholder={t("marketplace.search_placeholder")} value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} data-testid="filter-search" />
            </div>
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_branch")}</label>
            <select className="rsm-input" value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })} data-testid="filter-branch">
              {BRANCHES.map((b) => <option key={b} value={b}>{b || t("marketplace.all")}</option>)}
            </select>
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_type")}</label>
            <select className="rsm-input" value={filters.reinsurance_type} onChange={(e) => setFilters({ ...filters, reinsurance_type: e.target.value })}>
              {TYPES.map((b) => <option key={b} value={b}>{b || t("marketplace.all")}</option>)}
            </select>
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_country")}</label>
            <input className="rsm-input" value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })} />
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_broker")}</label>
            <select className="rsm-input" value={filters.has_broker} onChange={(e) => setFilters({ ...filters, has_broker: e.target.value })}>
              <option value="all">{t("marketplace.all")}</option>
              <option value="with">{t("marketplace.with_broker")}</option>
              <option value="without">{t("marketplace.without_broker")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={filters.verified_only} onChange={(e) => setFilters({ ...filters, verified_only: e.target.checked })} data-testid="filter-verified" />
            <span>{t("marketplace.filter_verified")}</span>
          </label>
        </aside>

        <div>
          <div className="mb-4 overline text-slate-500">{packs.length} resultados</div>
          {loading ? <div className="text-center py-12 text-slate-400">{t("common.loading")}</div> : packs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">{t("marketplace.no_results")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packs.map((p) => (
                <div key={p.id} className="relative">
                  <PackCard p={p} />
                  {user?.role === "reasegurador" && !p.own_interest && (
                    <button
                      onClick={(e) => { e.preventDefault(); setMsg({ open: true, pack: p, message: "" }); }}
                      className="absolute bottom-4 right-4 rsm-btn-primary text-xs"
                      data-testid={`express-${p.id}`}
                    >{t("marketplace.express_interest")}</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {msg.open && (
        <div className="fixed inset-0 bg-[#0B132B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setMsg({ open: false, pack: null, message: "" })}>
          <div className="bg-white border-2 border-[#0B132B] max-w-lg w-full p-8" style={{ boxShadow: "8px 8px 0 #0B132B" }} onClick={(e) => e.stopPropagation()}>
            <div className="overline">Expresar interés</div>
            <h3 className="font-display text-2xl font-semibold mt-1">{msg.pack?.code}</h3>
            <p className="text-sm text-slate-600 mt-2">{msg.pack?.title}</p>
            <label className="rsm-label mt-6">Mensaje (opcional, máx. 500)</label>
            <textarea className="rsm-input" rows={4} maxLength={500} value={msg.message} onChange={(e) => setMsg({ ...msg, message: e.target.value })} data-testid="interest-message" />
            <div className="mt-6 flex justify-end gap-3">
              <button className="rsm-btn-outline" onClick={() => setMsg({ open: false, pack: null, message: "" })}>{t("common.cancel")}</button>
              <button className="rsm-btn-primary" onClick={expressInterest} data-testid="confirm-interest">{t("marketplace.express_interest")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
