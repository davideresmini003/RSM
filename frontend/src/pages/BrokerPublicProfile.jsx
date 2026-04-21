import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { Star, Globe2, Building2, Languages as Lang, Linkedin, Globe } from "lucide-react";

export default function BrokerPublicProfile() {
  const { id } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => { api.get(`/broker/${id}`).then(({ data }) => setData(data)); }, [id]);

  if (!data) return <div className="p-8">{t("common.loading")}</div>;
  const { profile: p, broker_name, company, ratings } = data;
  const avg = ratings?.length ? (ratings.reduce((a, r) => a + (r.technical + r.communication + r.deadlines) / 3, 0) / ratings.length).toFixed(1) : null;

  return (
    <div className="p-8 max-w-5xl mx-auto" data-testid="broker-profile-page">
      <Link to="/app/brokers" className="overline text-slate-500 hover:text-[#0B132B]">← Brokers</Link>
      <div className="mt-4 rsm-card">
        <div className="flex items-start justify-between">
          <div>
            <div className="overline">Broker profile</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight mt-1">{company?.name}</h1>
            <div className="mt-2 text-sm text-slate-600">{broker_name} · {company?.country}</div>
          </div>
          {avg && <div className="text-right"><div className="font-mono-data text-3xl font-semibold">{avg}/5</div><div className="overline text-slate-500">{ratings.length} {t("broker.ratings")}</div></div>}
        </div>
        <p className="mt-6 text-base leading-relaxed text-slate-700">{p.bio}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <InfoBlock title={t("broker.specializations")} items={p.branches} />
        <InfoBlock title={t("broker.services") + " · cedentes"} items={p.services_cedentes} />
        <InfoBlock title={t("broker.services") + " · reaseguradores"} items={p.services_reaseguradores} />
        <InfoBlock title={t("broker.zones")} items={p.geographic_zones} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="rsm-card">
          <div className="overline">Datos</div>
          <div className="mt-4 space-y-2 text-sm">
            <div><span className="overline">Fundado</span><div>{p.founded_year || "—"}</div></div>
            <div><span className="overline">Equipo</span><div>{p.team_size || "—"}</div></div>
            <div><span className="overline">{t("broker.languages")}</span><div>{(p.languages || []).join(" · ")}</div></div>
            <div><span className="overline">Rango programas</span><div className="font-mono-data">€{Number(p.program_range_min||0).toLocaleString()} – €{Number(p.program_range_max||0).toLocaleString()}</div></div>
          </div>
        </div>
        <div className="rsm-card">
          <div className="overline">Licencias regulatorias</div>
          <div className="mt-4 space-y-2 text-sm">
            {(company?.licenses || []).map((l) => (
              <div key={`${l.authority}-${l.number}`} className="border border-[hsl(var(--border))] p-3">
                <div className="font-mono-data font-semibold">{l.authority} · {l.number}</div>
                <div className="text-xs text-slate-500 mt-1">{l.country} · {l.type}</div>
              </div>
            ))}
            {(!company?.licenses || company.licenses.length === 0) && <div className="text-xs text-slate-400">Sin licencias registradas.</div>}
          </div>
          <div className="mt-4 flex gap-4 text-xs">
            {p.linkedin_url && <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#0B132B]"><Linkedin size={12} /> LinkedIn</a>}
            {p.website_url && <a href={p.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#0B132B]"><Globe size={12} /> Web</a>}
          </div>
        </div>
      </div>

      {ratings?.length > 0 && (
        <div className="mt-8">
          <div className="overline mb-3">Valoraciones</div>
          <div className="space-y-2">
            {ratings.slice(0, 5).map((r) => (
              <div key={r.id} className="border border-[hsl(var(--border))] bg-white p-4 text-sm flex justify-between">
                <div>
                  <div className="overline">Cedente verificado</div>
                  <div className="text-xs text-slate-500 mt-1 font-mono-data">
                    Técnica {r.technical}/5 · Comunicación {r.communication}/5 · Plazos {r.deadlines}/5
                  </div>
                </div>
                <div className="font-mono-data text-xl">{((r.technical + r.communication + r.deadlines) / 3).toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoBlock({ title, items }) {
  return (
    <div className="rsm-card">
      <div className="overline mb-3">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {(items || []).map((x) => (
          <span key={x} className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 bg-slate-100 border border-[hsl(var(--border))]">{x}</span>
        ))}
        {(!items || items.length === 0) && <div className="text-xs text-slate-400">—</div>}
      </div>
    </div>
  );
}
