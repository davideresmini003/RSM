import React, { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { PackCard } from "./Dashboard";
import { VerifiedBadge, LossRatioPill, Tooltip } from "../components/ui-bits";
import { SkeletonCard } from "../components/ui-bits";
import { Search, X } from "lucide-react";

const BRANCHES = ["", "Property", "Casualty", "Marina", "Aviación", "Vida", "Salud", "Motor", "RC", "Ingeniería", "Agricultura", "Crédito", "Otro"];
const TYPES = ["", "Excess of Loss", "Quota Share", "Surplus", "Proporcional", "No proporcional", "Facultativo", "Treaty"];

function BrokerPackCard({ p, onOffer }) {
  const { t } = useI18n();
  const hasBroker = !!p.broker_id;
  const offerStatus = p.own_broker_offer;

  return (
    <div className="rsm-card" data-testid={`pack-card-${p.id}`}>
      <Link to={`/app/marketplace/${p.id}`} className="block">
        <div className="flex items-start justify-between">
          <div className="font-mono-data text-sm font-bold">{p.code}</div>
          <div className="flex gap-1 flex-wrap justify-end">
            {p.verified && <VerifiedBadge />}
            {p.broker_name && <span className="badge-anon">BROKER</span>}
          </div>
        </div>
        <h3 className="font-display text-lg font-semibold mt-3 line-clamp-2">{p.title}</h3>
        <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">{t("pack.f_branch")}</span><span className="font-semibold">{p.branch}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t("pack.f_type")}</span><span className="font-semibold">{p.reinsurance_type}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">{t("pack.f_country")}</span><span className="font-semibold">{p.country_region || "—"}</span></div>
          <div className="flex justify-between items-center">
            <Tooltip content="Loss Ratio: siniestros / primas × 100. &lt;65% bueno, &gt;80% elevado.">
              <span className="text-slate-500 cursor-default">LR avg ⓘ</span>
            </Tooltip>
            <LossRatioPill value={p.avg_loss_ratio} />
          </div>
          <div className="flex justify-between"><span className="text-slate-500">Primas Y-1</span><span className="font-mono-data">€{Number(p.premiums_y1 || 0).toLocaleString("es-ES")}</span></div>
          <div className="flex justify-between">
            <Tooltip content="Porcentaje del riesgo original cedido al reasegurador.">
              <span className="text-slate-500 cursor-default">Cesión ⓘ</span>
            </Tooltip>
            <span className="font-mono-data">{p.cession_pct}%</span>
          </div>
        </div>
        <div className="mt-3 flex items-center text-[10px] uppercase tracking-wider text-slate-400">
          <span>{p.interests_count} {t("marketplace.interests")}</span>
        </div>
      </Link>

      {!hasBroker && (
        <div className="mt-3 pt-3 border-t border-[hsl(var(--border))]">
          {!offerStatus && (
            <button
              className="rsm-btn-primary text-xs w-full"
              onClick={() => onOffer(p)}
              data-testid={`offer-btn-${p.id}`}
            >
              Ofrecer colaboración
            </button>
          )}
          {offerStatus === "pending" && (
            <div className="text-xs text-center text-slate-500 py-2 border border-[hsl(var(--border))]">
              Propuesta enviada · pendiente respuesta
            </div>
          )}
          {offerStatus === "accepted" && (
            <div className="text-xs text-center text-green-700 bg-green-50 border border-green-200 py-2">
              ✓ Propuesta aceptada
            </div>
          )}
          {offerStatus === "rejected" && (
            <div className="text-xs text-center text-red-700 bg-red-50 border border-red-200 py-2">
              Propuesta rechazada
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Marketplace() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [packs, setPacks] = useState([]);
  const [filters, setFilters] = useState({
    branch: searchParams.get("branch") || "",
    reinsurance_type: searchParams.get("reinsurance_type") || "",
    country: searchParams.get("country") || "",
    verified_only: searchParams.get("verified_only") === "true",
    has_broker: searchParams.get("has_broker") || "all",
    search: searchParams.get("search") || "",
  });
  const [loading, setLoading] = useState(false);
  const [offerModal, setOfferModal] = useState(null);
  const [offerMsg, setOfferMsg] = useState("");
  const [offerErr, setOfferErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const updateFilters = useCallback((next) => {
    setFilters(next);
    const p = new URLSearchParams();
    if (next.branch) p.set("branch", next.branch);
    if (next.reinsurance_type) p.set("reinsurance_type", next.reinsurance_type);
    if (next.country) p.set("country", next.country);
    if (next.verified_only) p.set("verified_only", "true");
    if (next.has_broker !== "all") p.set("has_broker", next.has_broker);
    if (next.search) p.set("search", next.search);
    setSearchParams(p, { replace: true });
  }, [setSearchParams]);

  const openOffer = (p) => {
    setOfferModal(p);
    setOfferMsg("");
    setOfferErr("");
  };

  const submitOffer = async () => {
    setSubmitting(true);
    setOfferErr("");
    try {
      await api.post(`/submission-packs/${offerModal.id}/broker-offer`, { message: offerMsg });
      setOfferModal(null);
      load();
    } catch (e) {
      setOfferErr(formatApiError(e.response?.data?.detail) || "Error al enviar la propuesta");
    } finally { setSubmitting(false); }
  };

  const isBroker = user?.role === "broker";

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
              <input className="rsm-input pl-9" placeholder={t("marketplace.search_placeholder")} value={filters.search} onChange={(e) => updateFilters({ ...filters, search: e.target.value })} data-testid="filter-search" />
            </div>
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_branch")}</label>
            <select className="rsm-input" value={filters.branch} onChange={(e) => updateFilters({ ...filters, branch: e.target.value })} data-testid="filter-branch">
              {BRANCHES.map((b) => <option key={b} value={b}>{b || t("marketplace.all")}</option>)}
            </select>
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_type")}</label>
            <select className="rsm-input" value={filters.reinsurance_type} onChange={(e) => updateFilters({ ...filters, reinsurance_type: e.target.value })}>
              {TYPES.map((b) => <option key={b} value={b}>{b || t("marketplace.all")}</option>)}
            </select>
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_country")}</label>
            <input className="rsm-input" value={filters.country} onChange={(e) => updateFilters({ ...filters, country: e.target.value })} />
          </div>
          <div>
            <label className="rsm-label">{t("marketplace.filter_broker")}</label>
            <select className="rsm-input" value={filters.has_broker} onChange={(e) => updateFilters({ ...filters, has_broker: e.target.value })}>
              <option value="all">{t("marketplace.all")}</option>
              <option value="with">{t("marketplace.with_broker")}</option>
              <option value="without">{t("marketplace.without_broker")}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={filters.verified_only} onChange={(e) => updateFilters({ ...filters, verified_only: e.target.checked })} data-testid="filter-verified" />
            <span>{t("marketplace.filter_verified")}</span>
          </label>
        </aside>

        <div>
          <div className="mb-4 overline text-slate-500">{packs.length} resultados</div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : packs.length === 0 ? (
            (() => {
              const hasActiveFilters = filters.branch || filters.reinsurance_type || filters.country || filters.verified_only || filters.has_broker !== "all" || filters.search;
              return (
                <div className="text-center py-16 flex flex-col items-center gap-4" data-testid="marketplace-empty">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                    <path d="M11 8v6" />
                    <path d="M8 11h6" />
                  </svg>
                  <p className="text-sm text-slate-500 max-w-md">
                    {hasActiveFilters ? t("marketplace.empty_filters_title") : t("marketplace.no_results")}
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={() => updateFilters({ branch: "", reinsurance_type: "", country: "", verified_only: false, has_broker: "all", search: "" })}
                      className="rsm-btn-outline text-xs"
                      data-testid="marketplace-clear-filters"
                    >
                      {t("marketplace.empty_filters_clear")}
                    </button>
                  )}
                </div>
              );
            })()
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packs.map((p) =>
                isBroker
                  ? <BrokerPackCard key={p.id} p={p} onOffer={openOffer} />
                  : <PackCard key={p.id} p={p} />
              )}
            </div>
          )}
        </div>
      </div>

      {offerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white w-full max-w-lg shadow-xl" data-testid="offer-modal">
            <div className="flex justify-between items-center px-6 py-4 border-b border-[hsl(var(--border))]">
              <h3 className="font-display text-xl font-semibold">Ofrecer colaboración</h3>
              <button onClick={() => setOfferModal(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="text-sm text-slate-700">
                <span className="font-mono-data font-bold">{offerModal.code}</span> · {offerModal.title}
              </div>
              <div className="text-xs text-slate-500">
                {offerModal.branch} · {offerModal.reinsurance_type} · {offerModal.country_region || "—"}
              </div>
              <div>
                <label className="rsm-label">Mensaje al cedente <span className="text-slate-400">({t("common.optional")})</span></label>
                <textarea
                  className="rsm-input mt-1 w-full resize-none"
                  rows={4}
                  placeholder="Describe tu experiencia y propuesta de valor para este programa..."
                  value={offerMsg}
                  onChange={(e) => setOfferMsg(e.target.value)}
                  data-testid="offer-msg"
                />
              </div>
              {offerErr && <div className="text-sm text-red-600">{offerErr}</div>}
            </div>
            <div className="px-6 py-4 border-t border-[hsl(var(--border))] flex justify-end gap-3">
              <button className="rsm-btn-outline" onClick={() => setOfferModal(null)}>{t("common.cancel")}</button>
              <button
                className="rsm-btn-primary"
                onClick={submitOffer}
                disabled={submitting}
                data-testid="offer-submit"
              >
                {submitting ? "Enviando…" : "Enviar propuesta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
