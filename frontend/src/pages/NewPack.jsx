import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { AlertTriangle } from "lucide-react";

const BRANCHES = ["Property", "Casualty", "Marina", "Aviación", "Vida", "Salud", "Motor", "RC", "Ingeniería", "Agricultura", "Crédito", "Otro"];
const TYPES = ["Excess of Loss", "Quota Share", "Surplus", "Proporcional", "No proporcional", "Facultativo", "Treaty"];

export default function NewPack() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [f, setF] = useState({
    title: "", branch: "Property", reinsurance_type: "Excess of Loss",
    country_region: "", coverage_period: "", cession_pct: 30,
    premiums_y1: 0, premiums_y2: 0, premiums_y3: 0,
    loss_ratio_y1: 0, loss_ratio_y2: 0, loss_ratio_y3: 0,
    description: "",
  });
  const upd = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = async (status) => {
    if (status === "published" && !confirm) { setErr("Marca la casilla de confirmación."); return; }
    try {
      const payload = { ...f, status, cession_pct: Number(f.cession_pct) || 0,
        premiums_y1: Number(f.premiums_y1) || 0, premiums_y2: Number(f.premiums_y2) || 0, premiums_y3: Number(f.premiums_y3) || 0,
        loss_ratio_y1: Number(f.loss_ratio_y1) || 0, loss_ratio_y2: Number(f.loss_ratio_y2) || 0, loss_ratio_y3: Number(f.loss_ratio_y3) || 0,
      };
      await api.post("/submission-packs", payload);
      nav("/app");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto" data-testid="new-pack-page">
      <div className="overline">{t("pack.title")}</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1">Nuevo Submission Pack</h1>
      <div className="mt-6 flex gap-1 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-1 flex-1 ${i <= step ? "bg-[#0B132B]" : "bg-[hsl(var(--border))]"}`} />
        ))}
      </div>
      <div className="bg-white border border-[hsl(var(--border))] p-8">
        {step === 1 && (
          <div className="space-y-5">
            <div className="overline">{t("pack.step1")}</div>
            <F label={t("pack.f_title") + " *"} value={f.title} onChange={(v) => upd("title", v)} />
            <div className="grid grid-cols-2 gap-4">
              <Sel label={t("pack.f_branch") + " *"} value={f.branch} onChange={(v) => upd("branch", v)} options={BRANCHES} />
              <Sel label={t("pack.f_type") + " *"} value={f.reinsurance_type} onChange={(v) => upd("reinsurance_type", v)} options={TYPES} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <F label={t("pack.f_country")} value={f.country_region} onChange={(v) => upd("country_region", v)} />
              <F label={t("pack.f_period")} value={f.coverage_period} onChange={(v) => upd("coverage_period", v)} placeholder="01/01/2026 – 31/12/2026" />
            </div>
            <F type="number" label={t("pack.f_cession") + " (%)"} value={f.cession_pct} onChange={(v) => upd("cession_pct", v)} />
            <div className="border-l-4 border-[#FCD34D] bg-[#FFFBEB] p-4 text-xs flex gap-3"><AlertTriangle size={16} className="shrink-0 text-[#92400E]" strokeWidth={1.5} /><span>{t("pack.warning_anon")}</span></div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="overline">{t("pack.step2")}</div>
            <div>
              <div className="rsm-label mb-3">{t("pack.primas")} (EUR)</div>
              <div className="grid grid-cols-3 gap-4">
                <F type="number" label={`${t("pack.year")} -1`} value={f.premiums_y1} onChange={(v) => upd("premiums_y1", v)} />
                <F type="number" label={`${t("pack.year")} -2`} value={f.premiums_y2} onChange={(v) => upd("premiums_y2", v)} />
                <F type="number" label={`${t("pack.year")} -3`} value={f.premiums_y3} onChange={(v) => upd("premiums_y3", v)} />
              </div>
            </div>
            <div>
              <div className="rsm-label mb-3">{t("pack.lr")} (%)</div>
              <div className="grid grid-cols-3 gap-4">
                <F type="number" label={`${t("pack.year")} -1`} value={f.loss_ratio_y1} onChange={(v) => upd("loss_ratio_y1", v)} />
                <F type="number" label={`${t("pack.year")} -2`} value={f.loss_ratio_y2} onChange={(v) => upd("loss_ratio_y2", v)} />
                <F type="number" label={`${t("pack.year")} -3`} value={f.loss_ratio_y3} onChange={(v) => upd("loss_ratio_y3", v)} />
              </div>
            </div>
            <div>
              <label className="rsm-label">{t("pack.description")}</label>
              <textarea className="rsm-input" rows={6} maxLength={2000} value={f.description} onChange={(e) => upd("description", e.target.value)} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="overline">{t("pack.step3")}</div>
            <p className="text-sm text-slate-600">Los documentos quedan clasificados como post-NCA: visibles al reasegurador solo tras la firma. Para el MVP la carga se simula.</p>
            <div className="space-y-2">
              {["SFCR", "Histórico de primas (3 años)", "Histórico de siniestros", "Grandes siniestros", "Exposición geográfica", "Estructura de reaseguro actual"].map((d) => (
                <div key={d} className="border border-dashed border-[hsl(var(--border))] p-3 text-sm text-slate-500 flex justify-between">
                  <span>{d}</span><span className="overline">Upload (simulado)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="overline">{t("pack.step4")}</div>
            <div className="border border-[hsl(var(--border))] bg-[#F8FAFC] p-6">
              <div className="font-mono-data text-xs text-slate-500">PREVIEW · ANÓNIMO</div>
              <h3 className="font-display text-2xl font-semibold mt-2">{f.title}</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><span className="overline">Ramo</span><div className="mt-1">{f.branch}</div></div>
                <div><span className="overline">Tipo</span><div className="mt-1">{f.reinsurance_type}</div></div>
                <div><span className="overline">País</span><div className="mt-1">{f.country_region || "—"}</div></div>
                <div><span className="overline">Cesión</span><div className="mt-1 font-mono-data">{f.cession_pct}%</div></div>
                <div><span className="overline">Prima Y-1</span><div className="mt-1 font-mono-data">€{Number(f.premiums_y1).toLocaleString("es-ES")}</div></div>
                <div><span className="overline">LR avg</span><div className="mt-1 font-mono-data">{((Number(f.loss_ratio_y1) + Number(f.loss_ratio_y2) + Number(f.loss_ratio_y3)) / 3).toFixed(1)}%</div></div>
              </div>
              <p className="mt-4 text-sm text-slate-600">{f.description || "—"}</p>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="confirm-anon" />
              <span>{t("pack.confirm_anon")}</span>
            </label>
          </div>
        )}
        {err && <div className="mt-4 text-xs text-[#D32F2F] border border-[#D32F2F] bg-red-50 p-3">{err}</div>}
      </div>

      <div className="flex justify-between mt-6">
        <button className="rsm-btn-outline" onClick={() => step > 1 ? setStep(step - 1) : nav("/app")} data-testid="pack-back">{step > 1 ? t("common.back") : t("common.cancel")}</button>
        {step < 4 ? (
          <button className="rsm-btn-primary" onClick={() => setStep(step + 1)} data-testid="pack-next">{t("common.next")}</button>
        ) : (
          <div className="flex gap-3">
            <button className="rsm-btn-outline" onClick={() => save("draft")} data-testid="pack-save-draft">{t("pack.save_draft")}</button>
            <button className="rsm-btn-primary" onClick={() => save("published")} data-testid="pack-publish">{t("pack.publish_now")}</button>
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="rsm-label">{label}</label>
      <input className="rsm-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <div>
      <label className="rsm-label">{label}</label>
      <select className="rsm-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
