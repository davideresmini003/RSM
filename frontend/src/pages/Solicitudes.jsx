import React, { useEffect, useState, useCallback } from "react";
import { api, formatApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { EmptyState } from "../components/ui-bits";

export default function Solicitudes() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const load = useCallback(() => {
    const endpoint = user.role === "broker" ? "/solicitudes/broker" : "/solicitudes/mine";
    api.get(endpoint).then(({ data }) => setItems(data.items || []));
  }, [user.role]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    try { await api.post(`/solicitudes/${id}/action`, { action }); load(); }
    catch (e) { alert(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto" data-testid="solicitudes-page">
      <div className="overline">Solicitudes</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">
        {user.role === "broker" ? t("broker.solicitudes_title") : "Mis solicitudes"}
      </h1>
      {items.length === 0 ? <EmptyState>{t("broker.no_sol")}</EmptyState> : (
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
                  <div className="text-xs text-slate-500 mt-1 flex gap-4">
                    <span>Zona: {s.geographic_zone || "—"}</span>
                    <span>Volumen: €{Number(s.volume_eur||0).toLocaleString("es-ES")}</span>
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
      )}
    </div>
  );
}
