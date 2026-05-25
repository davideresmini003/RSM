import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { AlertTriangle, CircleDot, Star, Check } from "lucide-react";

const BRANCHES = ["Property", "Casualty", "Marina", "Aviación", "Vida", "Salud", "Motor", "RC", "Ingeniería", "Agricultura", "Crédito", "Otro"];
const TYPES = ["Excess of Loss", "Quota Share", "Surplus", "Proporcional", "No proporcional", "Facultativo", "Treaty"];

export default function NewPack() {
  const { t } = useI18n();
  const { company } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [useBroker, setUseBroker] = useState(null); // null | false | true
  const [brokers, setBrokers] = useState([]);
  const [loadingBrokers, setLoadingBrokers] = useState(false);
  const [f, setF] = useState({
    title: "", branch: "Property", reinsurance_type: "Excess of Loss",
    country_region: "", coverage_period: "", cession_pct: 30,
    premiums_y1: 0, premiums_y2: 0, premiums_y3: 0,
    loss_ratio_y1: 0, loss_ratio_y2: 0, loss_ratio_y3: 0,
    description: "", broker_id: null,
  });
  const upd = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (useBroker && brokers.length === 0) {
      setLoadingBrokers(true);
      api.get("/marketplace/brokers")
        .then(({ data }) => setBrokers(data.brokers || []))
        .finally(() => setLoadingBrokers(false));
    }
  }, [useBroker]);

  const canNext = () => {
    if (step === 1) {
      if (!f.title.trim()) return false;
      if (useBroker === null) return false;
      if (useBroker === true && !f.broker_id) return false;
    }
    return true;
  };

  const [files, setFiles] = useState([]);

  const save = async (status) => {
    if (status === "published" && !confirm) { setErr("Marca la casilla de confirmación."); return; }
    try {
      const payload = {
        ...f,
        broker_id: useBroker ? f.broker_id : null,
        status,
        cession_pct: Number(f.cession_pct) || 0,
        premiums_y1: Number(f.premiums_y1) || 0, premiums_y2: Number(f.premiums_y2) || 0, premiums_y3: Number(f.premiums_y3) || 0,
        loss_ratio_y1: Number(f.loss_ratio_y1) || 0, loss_ratio_y2: Number(f.loss_ratio_y2) || 0, loss_ratio_y3: Number(f.loss_ratio_y3) || 0,
      };
      const { data } = await api.post("/submission-packs", payload);
      // upload any pending files now that the pack exists
      const packId = data?.pack?.id;
      if (packId && files.length > 0) {
        for (const fl of files) {
          const fd = new FormData();
          fd.append("file", fl);
          try { await api.post(`/submission-packs/${packId}/files`, fd); } catch (_) { /* skip on error */ }
        }
      }
      nav("/app");
    } catch (e) {
      const detail = e.response?.data?.detail || "";
      if (typeof detail === "string" && detail.startsWith("PACK_LIMIT:")) {
        setErr("PACK_LIMIT");
      } else {
        setErr(formatApiError(detail) || e.message);
      }
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
            <div className="border-l-4 border-[#FCD34D] bg-[#FFFBEB] p-4 text-xs flex gap-3">
              <AlertTriangle size={16} className="shrink-0 text-[#92400E]" strokeWidth={1.5} />
              <span>{t("pack.warning_anon")}</span>
            </div>

            {/* Broker selection */}
            <div className="border border-[hsl(var(--border))] p-5">
              <div className="overline mb-3">¿Deseas delegar la gestión a un broker?</div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setUseBroker(false); upd("broker_id", null); }}
                  className={`flex-1 border-2 p-4 text-left transition-colors ${useBroker === false ? "border-[#0B132B] bg-[#0B132B] text-white" : "border-[hsl(var(--border))] hover:border-slate-400"}`}
                  data-testid="no-broker-btn"
                >
                  <div className="font-semibold text-sm">Sin broker</div>
                  <div className={`text-xs mt-1 ${useBroker === false ? "text-slate-300" : "text-slate-500"}`}>
                    Publicas el pack y cualquier broker puede contactarte para ofrecerte sus servicios.
                  </div>
                </button>
                <button
                  onClick={() => setUseBroker(true)}
                  className={`flex-1 border-2 p-4 text-left transition-colors ${useBroker === true ? "border-[#0B132B] bg-[#0B132B] text-white" : "border-[hsl(var(--border))] hover:border-slate-400"}`}
                  data-testid="with-broker-btn"
                >
                  <div className="font-semibold text-sm">Con broker específico</div>
                  <div className={`text-xs mt-1 ${useBroker === true ? "text-slate-300" : "text-slate-500"}`}>
                    Selecciona un broker del marketplace y le enviamos una solicitud de colaboración.
                  </div>
                </button>
              </div>

              {useBroker === true && (
                <div className="mt-4">
                  <div className="rsm-label mb-3">Selecciona un broker *</div>
                  {loadingBrokers ? (
                    <div className="text-slate-400 text-sm py-4 text-center">{t("common.loading")}</div>
                  ) : brokers.length === 0 ? (
                    <div className="text-slate-400 text-sm py-4 text-center">No hay brokers disponibles en el marketplace.</div>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {brokers.map((b) => (
                        <button
                          key={b.broker_user_id}
                          onClick={() => upd("broker_id", b.broker_user_id)}
                          className={`w-full border p-3 text-left transition-colors flex items-start gap-3 ${f.broker_id === b.broker_user_id ? "border-[#0B132B] bg-slate-50" : "border-[hsl(var(--border))] hover:border-slate-400"}`}
                          data-testid={`select-broker-${b.broker_user_id}`}
                        >
                          <div className={`w-4 h-4 shrink-0 mt-0.5 border-2 rounded-full flex items-center justify-center ${f.broker_id === b.broker_user_id ? "border-[#0B132B] bg-[#0B132B]" : "border-slate-300"}`}>
                            {f.broker_id === b.broker_user_id && <Check size={9} strokeWidth={3} className="text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{b.company_name}</span>
                              <AvailabilityDot value={b.availability} />
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">{b.broker_name} · {b.country}</div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(b.branches || []).slice(0, 3).map((br) => (
                                <span key={br} className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 bg-slate-100 border border-[hsl(var(--border))]">{br}</span>
                              ))}
                            </div>
                            {b.rating_avg && (
                              <div className="flex items-center gap-1 mt-1.5 text-xs text-slate-500">
                                <Star size={11} strokeWidth={1.5} />
                                <span>{b.rating_avg}/5 ({b.ratings_count} valoraciones)</span>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {useBroker === true && !f.broker_id && (
                    <p className="text-xs text-slate-400 mt-2">Debes seleccionar un broker para continuar.</p>
                  )}
                </div>
              )}
            </div>
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
            <p className="text-sm text-slate-600">Sube los documentos del programa. Quedan clasificados como <b>post-NCA</b>: solo serán visibles al reasegurador después de la firma digital del NCA por ambas partes. Máx. 10 MB por archivo.</p>
            <label className="block border-2 border-dashed border-[hsl(var(--border))] hover:border-[#0B132B] p-8 text-center cursor-pointer transition-colors" data-testid="pack-file-dropzone">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files || []);
                  const allowed = picked.filter((fl) => fl.size <= 10 * 1024 * 1024);
                  setFiles((prev) => [...prev, ...allowed]);
                  e.target.value = "";
                }}
                data-testid="pack-file-input"
              />
              <div className="overline text-[#0B132B]">+ Añadir archivos</div>
              <div className="text-xs text-slate-500 mt-2">SFCR · Histórico de primas · Siniestros · Cualquier PDF/Excel/Word</div>
            </label>
            {files.length > 0 && (
              <div className="space-y-2" data-testid="pack-file-list">
                {files.map((fl, idx) => (
                  <div key={`${fl.name}-${idx}`} className="border border-[hsl(var(--border))] p-3 text-sm flex items-center justify-between">
                    <div>
                      <div className="font-medium">{fl.name}</div>
                      <div className="text-xs text-slate-500 font-mono-data">{(fl.size / 1024).toFixed(1)} KB · {fl.type || "—"}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="rsm-btn-danger"
                      data-testid={`pack-file-remove-${idx}`}
                    >Eliminar</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="overline">{t("pack.step4")}</div>
            {company && !company.verified && (
              <div className="border-l-4 border-[#D32F2F] bg-red-50 p-4 text-xs flex gap-3">
                <AlertTriangle size={16} className="shrink-0 text-[#D32F2F] mt-0.5" strokeWidth={1.5} />
                <span className="text-[#D32F2F]">Tu empresa está pendiente de verificación por el administrador RSM. Puedes guardar el borrador, pero no podrás publicar hasta que el administrador apruebe tu empresa.</span>
              </div>
            )}
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
            {useBroker === false && (
              <div className="border border-[hsl(var(--border))] bg-[#F8FAFC] px-4 py-3 text-sm text-slate-600">
                <span className="overline block mb-1">Sin broker</span>
                El pack será visible para todos los brokers del marketplace, quienes podrán contactarte directamente para ofrecerte sus servicios.
              </div>
            )}
            {useBroker === true && f.broker_id && (
              <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span className="overline block mb-1">Con broker seleccionado</span>
                Al publicar, se enviará automáticamente una solicitud de colaboración al broker seleccionado.
              </div>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="confirm-anon" />
              <span>{t("pack.confirm_anon")}</span>
            </label>
          </div>
        )}

        {err === "PACK_LIMIT" ? (
          <div className="mt-4 text-xs text-[#D32F2F] border border-[#D32F2F] bg-red-50 p-4 flex gap-3">
            <AlertTriangle size={16} className="shrink-0 text-[#D32F2F] mt-0.5" strokeWidth={1.5} />
            <span>
              Has alcanzado el límite de 5 packs publicados.{" "}
              <Link to="/app" className="underline font-semibold">Ve al dashboard</Link>{" "}
              y retira un pack existente para poder publicar uno nuevo.
            </span>
          </div>
        ) : err ? (
          <div className="mt-4 text-xs text-[#D32F2F] border border-[#D32F2F] bg-red-50 p-3">{err}</div>
        ) : null}
      </div>

      <div className="flex justify-between mt-6">
        <button
          className="rsm-btn-outline"
          onClick={() => { setErr(""); step > 1 ? setStep(step - 1) : nav("/app"); }}
          data-testid="pack-back"
        >
          {step > 1 ? t("common.back") : t("common.cancel")}
        </button>
        {step < 4 ? (
          <button
            className="rsm-btn-primary"
            onClick={() => { if (!canNext()) { setErr(step === 1 && useBroker === null ? "Selecciona si quieres trabajar con broker o no." : step === 1 && useBroker === true && !f.broker_id ? "Selecciona un broker para continuar." : ""); return; } setErr(""); setStep(step + 1); }}
            data-testid="pack-next"
          >
            {t("common.next")}
          </button>
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

function AvailabilityDot({ value }) {
  const map = {
    available: { c: "#10B981", l: "Disponible" },
    busy: { c: "#F59E0B", l: "Ocupado" },
    unavailable: { c: "#EF4444", l: "No disponible" },
  };
  const s = map[value] || map.unavailable;
  return (
    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold" style={{ color: s.c }}>
      <CircleDot size={9} strokeWidth={2} style={{ color: s.c, fill: s.c }} />
      {s.l}
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
