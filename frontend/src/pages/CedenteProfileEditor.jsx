import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

const BRANCHES = ["Property Cat", "Property No-Cat", "RC General", "RC Profesional", "Casco Marítimo", "Mercancías", "Aviación", "Vida", "Salud", "Motor", "Ingeniería", "Cyber", "Crédito y Caución", "Riesgo Político", "Solvency II", "Soporte Actuarial", "Compliance"];
const ZONES = ["Península Ibérica", "Europa Occidental", "Europa Central", "Nórdicos", "Europa del Este", "UK & Irlanda", "Mediterráneo", "Latinoamérica", "Norteamérica", "Oriente Medio & África", "Asia-Pacífico", "Global"];
const LANGS = ["ES", "EN", "IT", "FR", "DE", "PT"];

export default function CedenteProfileEditor() {
  const { t } = useI18n();
  const [p, setP] = useState({
    bio: "", branches: [], geographic_zones: [], languages: [],
    linkedin_url: "", website_url: "",
  });
  const [company, setCompany] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/cedente/profile/me").then(({ data }) => {
      if (data.profile) setP((prev) => ({ ...prev, ...data.profile }));
      if (data.company) setCompany(data.company);
    });
    // eslint-disable-next-line
  }, []);

  const toggle = (key, v) => setP((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((i) => i !== v) : [...x[key], v] }));

  const save = async () => {
    await api.put("/cedente/profile", p);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto" data-testid="cedente-profile-editor">
      <div className="overline">Mi perfil público</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">{t("cedente.profile_title")}</h1>

      {company && (
        <div className="rsm-card mb-6 bg-slate-50">
          <div className="overline mb-3">Datos de empresa (sólo lectura)</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><div className="overline text-slate-400">Empresa</div><div className="font-semibold mt-1">{company.name}</div></div>
            <div><div className="overline text-slate-400">País</div><div className="font-semibold mt-1">{company.country || "—"}</div></div>
            <div><div className="overline text-slate-400">NIF</div><div className="font-semibold mt-1">{company.tax_id || "—"}</div></div>
            <div><div className="overline text-slate-400">Email corporativo</div><div className="font-semibold mt-1">{company.corporate_email || "—"}</div></div>
            <div><div className="overline text-slate-400">Teléfono</div><div className="font-semibold mt-1">{company.phone || "—"}</div></div>
            <div><div className="overline text-slate-400">Estado</div><div className={`mt-1 font-semibold ${company.verified ? "text-emerald-700" : "text-amber-600"}`}>{company.verified ? "✓ Verificado" : "Pendiente verificación"}</div></div>
          </div>
        </div>
      )}

      <div className="rsm-card mb-6">
        <div className="overline mb-3">Bio</div>
        <textarea
          className="rsm-input"
          rows={4}
          maxLength={500}
          value={p.bio}
          onChange={(e) => setP({ ...p, bio: e.target.value })}
          placeholder="Describe brevemente tu empresa, su actividad y objetivos en el mercado reasegurador..."
          data-testid="bio-field"
        />
        <div className="text-xs text-slate-400 mt-1 text-right">{p.bio.length}/500</div>
      </div>

      <Toggles title={t("cedente.branches")} items={BRANCHES} selected={p.branches} onToggle={(v) => toggle("branches", v)} />
      <Toggles title={t("cedente.zones")} items={ZONES} selected={p.geographic_zones} onToggle={(v) => toggle("geographic_zones", v)} />
      <Toggles title={t("cedente.languages")} items={LANGS} selected={p.languages} onToggle={(v) => toggle("languages", v)} />

      <div className="rsm-card mb-6">
        <div className="overline mb-3">Enlaces</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="rsm-label">LinkedIn</label>
            <input className="rsm-input" value={p.linkedin_url} onChange={(e) => setP({ ...p, linkedin_url: e.target.value })} placeholder="https://linkedin.com/company/..." />
          </div>
          <div>
            <label className="rsm-label">Web</label>
            <input className="rsm-input" value={p.website_url} onChange={(e) => setP({ ...p, website_url: e.target.value })} placeholder="https://..." />
          </div>
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
            <button
              key={v}
              onClick={() => onToggle(v)}
              className={`text-[11px] uppercase tracking-wider font-semibold px-3 py-1.5 border transition-colors ${on ? "bg-[#0B132B] text-white border-[#0B132B]" : "bg-white text-slate-600 border-[hsl(var(--border))] hover:border-[#0B132B]"}`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}
