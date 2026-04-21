import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { api, formatApiError } from "../lib/api";

export default function Onboarding() {
  const { user, refresh } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "", tax_id: "", country: "España", address: "",
    corporate_email: user?.email || "", phone: "",
    legal_rep_name: "", legal_rep_id: "", legal_rep_role: "",
    rating_agency: "AM Best", rating_value: "A-",
    licenses: [{ country: "España", authority: "DGSFP", number: "", type: "Broker Reaseguro" }],
  });
  const [accepted, setAccepted] = useState(false);
  const [acceptedRsmNca, setAcceptedRsmNca] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const role = user?.role;
  const totalSteps = role === "broker" ? 5 : 4;

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!accepted) { setErr("Debes aceptar los términos y la política RGPD"); return; }
    if (role === "broker" && !acceptedRsmNca) { setErr("Debes firmar el NCA con RSM"); return; }
    setLoading(true); setErr("");
    try {
      const payload = {
        name: form.name, tax_id: form.tax_id, country: form.country, address: form.address,
        corporate_email: form.corporate_email, phone: form.phone,
        legal_rep_name: form.legal_rep_name, legal_rep_id: form.legal_rep_id, legal_rep_role: form.legal_rep_role,
      };
      if (role === "reasegurador") {
        payload.rating_agency = form.rating_agency;
        payload.rating_value = form.rating_value;
      }
      if (role === "broker") {
        payload.licenses = form.licenses;
      }
      await api.post("/onboarding/company", payload);
      await refresh();
      nav("/app");
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-12" data-testid="onboarding-page">
      <div className="max-w-3xl mx-auto bg-white border border-[hsl(var(--border))]">
        <div className="px-8 py-6 border-b border-[hsl(var(--border))]">
          <div className="overline">{t("onboarding.title")}</div>
          <h1 className="font-display text-2xl font-semibold mt-1">{t(`roles.${role}`)} · Paso {step}/{totalSteps}</h1>
          <div className="mt-4 flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 ${i < step ? "bg-[#0B132B]" : "bg-[hsl(var(--border))]"}`} />
            ))}
          </div>
        </div>

        <div className="p-8 space-y-5">
          {step === 1 && (
            <>
              <div className="overline">{t("onboarding.step_company")}</div>
              <Field label={t("onboarding.company_name")} value={form.name} onChange={(v) => upd("name", v)} required />
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("onboarding.tax_id")} value={form.tax_id} onChange={(v) => upd("tax_id", v)} required />
                <Field label={t("onboarding.country")} value={form.country} onChange={(v) => upd("country", v)} required />
              </div>
              <Field label={t("onboarding.address")} value={form.address} onChange={(v) => upd("address", v)} required />
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("onboarding.corporate_email")} type="email" value={form.corporate_email} onChange={(v) => upd("corporate_email", v)} required />
                <Field label={t("onboarding.phone")} value={form.phone} onChange={(v) => upd("phone", v)} required />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="overline">{t("onboarding.step_legal")}</div>
              <Field label={t("onboarding.legal_rep_name")} value={form.legal_rep_name} onChange={(v) => upd("legal_rep_name", v)} required />
              <div className="grid grid-cols-2 gap-4">
                <Field label={t("onboarding.legal_rep_id")} value={form.legal_rep_id} onChange={(v) => upd("legal_rep_id", v)} required />
                <Field label={t("onboarding.legal_rep_role")} value={form.legal_rep_role} onChange={(v) => upd("legal_rep_role", v)} required />
              </div>
            </>
          )}

          {step === 3 && role === "cedente" && (
            <>
              <div className="overline">{t("onboarding.step_docs")}</div>
              <div className="border-2 border-dashed border-[hsl(var(--border))] p-8 text-center text-sm text-slate-500">
                Upload SFCR (Solvency and Financial Condition Report) — opcional para MVP. La verificación por el admin se basará en el NIF.
              </div>
            </>
          )}

          {step === 3 && role === "reasegurador" && (
            <>
              <div className="overline">{t("onboarding.step_rating")}</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="rsm-label">{t("onboarding.rating_agency")}</label>
                  <select className="rsm-input" value={form.rating_agency} onChange={(e) => upd("rating_agency", e.target.value)}>
                    <option>AM Best</option><option>S&P</option>
                  </select>
                </div>
                <div>
                  <label className="rsm-label">{t("onboarding.rating_value")}</label>
                  <select className="rsm-input" value={form.rating_value} onChange={(e) => upd("rating_value", e.target.value)}>
                    {["A-", "A", "A+", "AA-", "AA", "AA+", "AAA"].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="border-2 border-dashed border-[hsl(var(--border))] p-6 text-center text-sm text-slate-500">
                Upload certificado oficial — opcional para MVP.
              </div>
            </>
          )}

          {step === 3 && role === "broker" && (
            <>
              <div className="overline">{t("onboarding.step_licenses")}</div>
              {form.licenses.map((lic, idx) => (
                <div key={idx} className="grid grid-cols-4 gap-3 items-end border border-[hsl(var(--border))] p-4">
                  <Field label={t("onboarding.license_country")} value={lic.country} onChange={(v) => {
                    const ls = [...form.licenses]; ls[idx] = { ...lic, country: v }; upd("licenses", ls);
                  }} />
                  <div>
                    <label className="rsm-label">{t("onboarding.license_authority")}</label>
                    <select className="rsm-input" value={lic.authority} onChange={(e) => {
                      const ls = [...form.licenses]; ls[idx] = { ...lic, authority: e.target.value }; upd("licenses", ls);
                    }}>
                      {["DGSFP", "IVASS", "ACPR", "BaFin", "FCA"].map((a) => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <Field label={t("onboarding.license_number")} value={lic.number} onChange={(v) => {
                    const ls = [...form.licenses]; ls[idx] = { ...lic, number: v }; upd("licenses", ls);
                  }} />
                  <Field label={t("onboarding.license_type")} value={lic.type} onChange={(v) => {
                    const ls = [...form.licenses]; ls[idx] = { ...lic, type: v }; upd("licenses", ls);
                  }} />
                </div>
              ))}
              <button type="button" onClick={() => upd("licenses", [...form.licenses, { country: "", authority: "DGSFP", number: "", type: "" }])} className="rsm-btn-outline text-xs" data-testid="add-license">
                {t("onboarding.add_license")}
              </button>
            </>
          )}

          {step === 4 && role === "broker" && (
            <>
              <div className="overline">{t("onboarding.step_nca_rsm")}</div>
              <div className="border border-[hsl(var(--border))] p-6 bg-[#F8FAFC] text-sm leading-relaxed max-h-64 overflow-y-auto">
                <p className="font-semibold mb-3">NCA con RSM Technologies SL</p>
                <p>El broker se obliga a no utilizar la información adquirida en la plataforma fuera de la misma, y a no contactar entidades conocidas a través de RSM durante los 24 meses posteriores a la finalización del uso de la plataforma.</p>
                <p className="mt-3">Todas las acciones quedan registradas en el audit log inmutable. La firma digital tiene validez legal en la UE conforme al reglamento eIDAS.</p>
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={acceptedRsmNca} onChange={(e) => setAcceptedRsmNca(e.target.checked)} data-testid="accept-rsm-nca" />
                <span>{t("onboarding.accept_nca_rsm")}</span>
              </label>
            </>
          )}

          {((step === 4 && role !== "broker") || (step === 5 && role === "broker")) && (
            <>
              <div className="overline">{t("onboarding.step_confirm")}</div>
              <div className="border border-[hsl(var(--border))] p-6 bg-[#F8FAFC] text-sm space-y-1">
                <div><b>Empresa:</b> {form.name}</div>
                <div><b>NIF:</b> {form.tax_id}</div>
                <div><b>País:</b> {form.country}</div>
                <div><b>Representante:</b> {form.legal_rep_name} ({form.legal_rep_role})</div>
              </div>
              <div className="border-l-4 border-[#FCD34D] bg-[#FFFBEB] p-4 text-sm">
                {t("onboarding.pending_msg")}
              </div>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="accept-rgpd" />
                <span>{t("onboarding.accept_rgpd")}</span>
              </label>
            </>
          )}

          {err && <div className="text-xs text-[#D32F2F] border border-[#D32F2F] bg-red-50 p-3">{err}</div>}
        </div>

        <div className="px-8 py-5 border-t border-[hsl(var(--border))] flex justify-between">
          <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} className="rsm-btn-outline" disabled={step === 1} data-testid="onb-back">{t("common.back")}</button>
          {step < totalSteps ? (
            <button type="button" onClick={() => setStep((s) => s + 1)} className="rsm-btn-primary" data-testid="onb-next">{t("common.next")}</button>
          ) : (
            <button type="button" onClick={submit} disabled={loading} className="rsm-btn-primary" data-testid="onb-finish">
              {loading ? t("common.loading") : t("onboarding.finish")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }) {
  return (
    <div>
      <label className="rsm-label">{label}{required && <span className="text-[#D32F2F]"> *</span>}</label>
      <input className="rsm-input" type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}
