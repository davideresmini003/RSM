import React, { useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { EmptyState, SkeletonRow } from "../components/ui-bits";
import { useConfirm } from "../lib/confirm";

export default function Solicitudes() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [brokerOffers, setBrokerOffers] = useState([]);
  const [actErr, setActErr] = useState("");
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmPortal } = useConfirm();

  const load = useCallback(() => {
    const endpoint = user.role === "broker" ? "/solicitudes/broker" : "/solicitudes/mine";
    const p1 = api.get(endpoint).then(({ data }) => setItems(data.items || []));
    const p2 = user.role === "cedente"
      ? api.get("/submission-packs/broker-offers/received").then(({ data }) => setBrokerOffers(data.offers || [])).catch(() => {})
      : Promise.resolve();
    Promise.all([p1, p2]).finally(() => setLoading(false));
  }, [user.role]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    if (action === "decline") {
      const ok = await confirm({ title: "¿Declinar esta solicitud?", message: "Esta acción no se puede deshacer.", confirmLabel: "Declinar" });
      if (!ok) return;
    }
    setActErr("");
    try { await api.post(`/solicitudes/${id}/action`, { action }); load(); }
    catch (e) { setActErr(formatApiError(e.response?.data?.detail)); }
  };

  const respondOffer = async (offerId, action) => {
    if (action === "reject") {
      const ok = await confirm({ title: "¿Rechazar la propuesta?", message: "El broker no será asignado a este pack.", confirmLabel: "Rechazar" });
      if (!ok) return;
    }
    setActErr("");
    try { await api.post(`/submission-packs/broker-offers/${offerId}/respond`, { action }); load(); }
    catch (e) { setActErr(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto" data-testid="solicitudes-page">
      <div className="overline">Solicitudes</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">
        {user.role === "broker" ? t("broker.solicitudes_title") : "Mis solicitudes"}
      </h1>

      {ConfirmPortal}
      {actErr && <div className="mb-4 text-sm text-red-600 border border-red-200 bg-red-50 px-4 py-2">{actErr}</div>}

      {loading && <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonRow key={i} />)}</div>}

      {/* Broker section: propuestas recibidas de pack offers del cedente */}
      {user.role === "cedente" && brokerOffers.length > 0 && (
        <section className="mb-10">
          <div className="overline text-slate-500 mb-3">Propuestas de brokers</div>
          <div className="space-y-3">
            {brokerOffers.map((o) => (
              <div key={o.id} className="rsm-card border-l-4 border-[#1565C0]" data-testid={`offer-${o.id}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 border bg-blue-50 text-blue-900 border-blue-300">
                        BROKER
                      </span>
                      <span className="font-semibold text-sm">{o.broker_name}</span>
                      <span className="text-xs text-slate-500">{o.broker_company}</span>
                    </div>
                    <div className="text-xs text-slate-500 mb-2">
                      Pack <span className="font-mono-data font-semibold">{o.pack_code}</span> · Propuesta enviada {new Date(o.created_at).toLocaleDateString()}
                    </div>
                    {o.message && <p className="text-sm text-slate-600">{o.message}</p>}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      className="rsm-btn-primary text-xs"
                      onClick={() => respondOffer(o.id, "accept")}
                      data-testid={`accept-offer-${o.id}`}
                    >
                      {t("common.accept")}
                    </button>
                    <button
                      className="rsm-btn-danger"
                      onClick={() => respondOffer(o.id, "reject")}
                      data-testid={`reject-offer-${o.id}`}
                    >
                      {t("common.reject")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Solicitudes list */}
      {items.length === 0 && (user.role !== "cedente" || brokerOffers.length === 0) ? (
        <EmptyState>{t("broker.no_sol")}</EmptyState>
      ) : items.length > 0 ? (
        <>
          {user.role === "cedente" && (
            <div className="overline text-slate-500 mb-3">Solicitudes enviadas</div>
          )}
          <div className="space-y-3">
            {items.map((s) => (
              <div key={s.id} className="rsm-card" data-testid={`sol-${s.id}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 border ${s.requester_role === "cedente" ? "bg-blue-50 text-blue-900 border-blue-300" : "bg-purple-50 text-purple-900 border-purple-300"}`}>
                        {s.requester_role === "cedente" ? "CEDENTE" : "REASEGURADOR"}
                      </span>
                      <span className="overline">{s.status}</span>
                      <span className="font-mono-data text-xs text-slate-500">{s.requester_country}</span>
                    </div>
                    <div className="font-display text-xl font-semibold mt-2">{s.service}</div>
                    {s.pack_code && (
                      <div className="text-xs text-slate-500 mt-1">
                        Pack: <span className="font-mono-data font-semibold">{s.pack_code}</span>
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1 flex gap-4">
                      <span>Zona: {s.geographic_zone || "—"}</span>
                      <span>Volumen: €{Number(s.volume_eur || 0).toLocaleString("es-ES")}</span>
                      <span>Exp: {new Date(s.expires_at).toLocaleDateString()}</span>
                    </div>
                    {s.message && <p className="text-sm text-slate-600 mt-3">{s.message}</p>}
                  </div>
                  {user.role === "broker" && s.status === "pending" && (
                    <div className="flex flex-col gap-2 ml-4">
                      <button className="rsm-btn-primary text-xs" onClick={() => act(s.id, "accept")} data-testid={`accept-${s.id}`}>{t("broker.accept")}</button>
                      <button className="rsm-btn-danger" onClick={() => act(s.id, "decline")} data-testid={`decline-${s.id}`}>{t("broker.decline")}</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
