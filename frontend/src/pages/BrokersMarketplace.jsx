import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { CircleDot, Star, Globe2, Languages as Lang } from "lucide-react";

export default function BrokersMarketplace() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [brokers, setBrokers] = useState([]);
  const [modal, setModal] = useState(null);

  const load = () => api.get("/marketplace/brokers").then(({ data }) => setBrokers(data.brokers || []));
  useEffect(() => { load(); }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="brokers-marketplace">
      <div className="overline">Brokers</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">{t("broker.marketplace_title")}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {brokers.length === 0 && <div className="text-slate-400 text-sm col-span-2 text-center py-12">Sin brokers visibles todavía.</div>}
        {brokers.map((b) => (
          <div key={b.broker_user_id} className="rsm-card rsm-card-hover" data-testid={`broker-${b.broker_user_id}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-lg font-semibold">{b.company_name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{b.broker_name} · {b.country}</div>
              </div>
              <AvailabilityDot value={b.availability} />
            </div>
            <p className="mt-3 text-sm text-slate-600 line-clamp-2">{b.bio}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(b.branches || []).slice(0, 4).map((br) => (
                <span key={br} className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 bg-slate-100 border border-[hsl(var(--border))]">{br}</span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1"><Globe2 size={12} strokeWidth={1.5} /> {(b.geographic_zones || []).slice(0, 2).join(", ")}</span>
              <span className="flex items-center gap-1"><Lang size={12} strokeWidth={1.5} /> {(b.languages || []).join("/")}</span>
              <span className="flex items-center gap-1 font-mono-data">
                <Star size={12} strokeWidth={1.5} />
                {b.rating_avg ? `${b.rating_avg}/5 (${b.ratings_count})` : "—"}
              </span>
            </div>
            <div className="mt-4 flex gap-2">
              <Link to={`/app/brokers/${b.broker_user_id}`} className="rsm-btn-outline text-xs" data-testid={`view-broker-${b.broker_user_id}`}>{t("common.view")}</Link>
              {user?.role !== "broker" && (
                <button className="rsm-btn-primary text-xs" onClick={() => setModal(b)} data-testid={`contact-broker-${b.broker_user_id}`}>{t("broker.contact")}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {modal && <ContactModal broker={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function AvailabilityDot({ value }) {
  const { t } = useI18n();
  const map = {
    available: { c: "#10B981", l: t("broker.availability_available") },
    busy: { c: "#F59E0B", l: t("broker.availability_busy") },
    unavailable: { c: "#EF4444", l: t("broker.availability_unavailable") },
  };
  const s = map[value] || map.unavailable;
  return <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold"><CircleDot size={10} strokeWidth={2} style={{ color: s.c, fill: s.c }} />{s.l}</div>;
}

function ContactModal({ broker, onClose }) {
  const { t } = useI18n();
  const [f, setF] = useState({ service: "Gestión programa", program_type: "", volume_eur: 0, geographic_zone: "", message: "" });
  const [err, setErr] = useState("");
  const submit = async () => {
    try {
      await api.post("/solicitudes", { broker_id: broker.broker_user_id, ...f, volume_eur: Number(f.volume_eur) || 0 });
      onClose();
    } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <div className="fixed inset-0 bg-[#0B132B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-2 border-[#0B132B] max-w-xl w-full p-8" style={{ boxShadow: "8px 8px 0 #0B132B" }} onClick={(e) => e.stopPropagation()}>
        <div className="overline">{t("broker.contact_modal_title")}</div>
        <h3 className="font-display text-2xl font-semibold mt-1">{broker.company_name}</h3>
        <div className="mt-6 space-y-4">
          <div>
            <label className="rsm-label">{t("broker.service")}</label>
            <select className="rsm-input" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })}>
              {["Gestión programa", "Acceso mercados", "Due Diligence", "Soporte regulatorio", "Asesoramiento actuarial", "Asesoramiento técnico"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="rsm-label">{t("broker.program_type")}</label><input className="rsm-input" value={f.program_type} onChange={(e) => setF({ ...f, program_type: e.target.value })} /></div>
            <div><label className="rsm-label">{t("broker.volume")}</label><input type="number" className="rsm-input" value={f.volume_eur} onChange={(e) => setF({ ...f, volume_eur: e.target.value })} /></div>
          </div>
          <div><label className="rsm-label">{t("broker.geographic_zone")}</label><input className="rsm-input" value={f.geographic_zone} onChange={(e) => setF({ ...f, geographic_zone: e.target.value })} /></div>
          <div><label className="rsm-label">{t("broker.message")}</label><textarea rows={4} className="rsm-input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} data-testid="solicitud-message" /></div>
        </div>
        {err && <div className="mt-3 text-xs text-[#D32F2F] border border-[#D32F2F] bg-red-50 p-3">{err}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rsm-btn-outline" onClick={onClose}>{t("common.cancel")}</button>
          <button className="rsm-btn-primary" onClick={submit} data-testid="send-solicitud">{t("common.submit")}</button>
        </div>
      </div>
    </div>
  );
}
