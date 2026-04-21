import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

const BRANCHES = ["Property Cat", "Property No-Cat", "RC General", "RC Profesional", "Casco Marítimo", "Mercancías", "Aviación", "Vida", "Salud", "Motor", "Ingeniería", "Cyber", "Crédito y Caución", "Riesgo Político", "Solvency II", "Soporte Actuarial", "Compliance"];
const SERVICES_CED = ["Gestión programa", "Acceso mercados", "Due Diligence", "Soporte regulatorio", "Gestión siniestros", "Revisión cartera", "Asesoramiento actuarial"];
const SERVICES_REA = ["Asesoramiento técnico", "Acceso oportunidades", "Due Diligence cedente", "Soporte regulatorio", "Análisis cartera", "Asesoramiento actuarial"];
const ZONES = ["Península Ibérica", "Europa Occidental", "Europa Central", "Nórdicos", "Europa del Este", "UK & Irlanda", "Mediterráneo", "Latinoamérica", "Norteamérica", "Oriente Medio & África", "Asia-Pacífico", "Global"];
const LANGS = ["ES", "EN", "IT", "FR", "DE", "PT"];

export default function BrokerProfileEditor() {
  const { t } = useI18n();
  const [p, setP] = useState({
    visible_in_marketplace: false, availability: "available", bio: "",
    founded_year: 2020, team_size: "2-5", branches: [], services_cedentes: [],
    services_reaseguradores: [], geographic_zones: [], program_range_min: 0, program_range_max: 0,
    languages: [], linkedin_url: "", website_url: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/broker/profile/me").then(({ data }) => { if (data.profile) setP({ ...p, ...data.profile }); });
    // eslint-disable-next-line
  }, []);

  const toggle = (key, v) => setP((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((i) => i !== v) : [...x[key], v] }));
  const save = async () => {
    await api.put("/broker/profile", p);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto" data-testid="broker-profile-editor">
      <div className="overline">Mi perfil público</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">{t("broker.profile_title")}</h1>

      <div className="rsm-card mb-6">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={p.visible_in_marketplace} onChange={(e) => setP({ ...p, visible_in_marketplace: e.target.checked })} data-testid="visible-toggle" />
          <span className="font-semibold">{t("broker.visible_toggle")}</span>
        </label>
        <div className="mt-4">
          <label className="rsm-label">Disponibilidad</label>
          <select className="rsm-input" value={p.availability} onChange={(e) => setP({ ...p, availability: e.target.value })}>
            <option value="available">{t("broker.availability_available")}</option>
            <option value="busy">{t("broker.availability_busy")}</option>
            <option value="unavailable">{t("broker.availability_unavailable")}</option>
          </select>
        </div>
      </div>

      <div className="rsm-card mb-6">
        <div className="overline mb-3">Bio</div>
        <textarea className="rsm-input" rows={4} maxLength={500} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} data-testid="bio-field" />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div><label className="rsm-label">Año fundación</label><input type="number" className="rsm-input" value={p.founded_year || ""} onChange={(e) => setP({ ...p, founded_year: Number(e.target.value) })} /></div>
          <div><label className="rsm-label">Tamaño equipo</label><select className="rsm-input" value={p.team_size} onChange={(e) => setP({ ...p, team_size: e.target.value })}>{["Solo", "2-5", "6-20", "20+"].map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
      </div>

      <Toggles title={t("broker.specializations")} items={BRANCHES} selected={p.branches} onToggle={(v) => toggle("branches", v)} />
      <Toggles title={t("broker.services") + " · cedentes"} items={SERVICES_CED} selected={p.services_cedentes} onToggle={(v) => toggle("services_cedentes", v)} />
      <Toggles title={t("broker.services") + " · reaseguradores"} items={SERVICES_REA} selected={p.services_reaseguradores} onToggle={(v) => toggle("services_reaseguradores", v)} />
      <Toggles title={t("broker.zones")} items={ZONES} selected={p.geographic_zones} onToggle={(v) => toggle("geographic_zones", v)} />
      <Toggles title={t("broker.languages")} items={LANGS} selected={p.languages} onToggle={(v) => toggle("languages", v)} />

      <div className="rsm-card mb-6">
        <div className="overline mb-3">Rango de programas (EUR)</div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="rsm-label">Mínimo</label><input type="number" className="rsm-input" value={p.program_range_min} onChange={(e) => setP({ ...p, program_range_min: Number(e.target.value) })} /></div>
          <div><label className="rsm-label">Máximo</label><input type="number" className="rsm-input" value={p.program_range_max} onChange={(e) => setP({ ...p, program_range_max: Number(e.target.value) })} /></div>
        </div>
      </div>

      <div className="rsm-card mb-6">
        <div className="overline mb-3">Enlaces</div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="rsm-label">LinkedIn</label><input className="rsm-input" value={p.linkedin_url} onChange={(e) => setP({ ...p, linkedin_url: e.target.value })} /></div>
          <div><label className="rsm-label">Web</label><input className="rsm-input" value={p.website_url} onChange={(e) => setP({ ...p, website_url: e.target.value })} /></div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="rsm-btn-primary" onClick={save} data-testid="save-profile">{t("common.save")}</button>
        {saved && <span className="text-emerald-700 text-sm">✓ Guardado</span>}
      </div>
    </div>
  );
}

function Toggles({ title, items, selected, onToggle }) {
  return (
    <div className="rsm-card mb-6">
      <div className="overline mb-3">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((v) => {
          const on = selected.includes(v);
          return (
            <button key={v} onClick={() => onToggle(v)} className={`text-[11px] uppercase tracking-wider font-semibold px-3 py-1.5 border transition-colors ${on ? "bg-[#0B132B] text-white border-[#0B132B]" : "bg-white text-slate-600 border-[hsl(var(--border))] hover:border-[#0B132B]"}`}>
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
