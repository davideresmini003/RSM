import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { EmptyState } from "../components/ui-bits";
import { FileSignature, Lock } from "lucide-react";

export default function Mandates() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [modal, setModal] = useState(null);

  const load = () => api.get("/mandates").then(({ data }) => setItems(data.mandates || []));
  useEffect(() => { load(); }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto" data-testid="mandates-page">
      <div className="overline">Mandatos</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">{t("broker.mandate_title")}</h1>
      {items.length === 0 ? <EmptyState>Sin mandatos todavía.</EmptyState> : (
        <div className="space-y-3">
          {items.map((m) => (
            <div key={m.id} className="rsm-card" data-testid={`mandate-${m.id}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="overline">Cedente</div>
                  <div className="mt-1 font-mono-data font-semibold flex items-center gap-2">
                    {m.nca_both_signed ? m.cedente_name : <><Lock size={12} className="text-slate-400" />ANÓNIMO</>}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    Broker: {m.nca_signed_broker ? "✓" : "—"} · Cedente: {m.nca_signed_cedente ? "✓" : "—"} · Estado: <span className="overline">{m.status}</span>
                  </div>
                </div>
                {((user.role === "broker" && !m.nca_signed_broker) || (user.role === "cedente" && !m.nca_signed_cedente)) && (
                  <button className="rsm-btn-primary text-xs" onClick={() => setModal(m)} data-testid={`sign-${m.id}`}>
                    <FileSignature size={12} className="inline mr-1" /> {t("operation.sign_nca")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <SignMandateModal mandate={modal} onClose={() => setModal(null)} onSigned={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}

function SignMandateModal({ mandate, onClose, onSigned }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    try { await api.post(`/mandates/${mandate.id}/sign`, { signer_name: name }); onSigned(); }
    catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
  };
  return (
    <div className="fixed inset-0 bg-[#0B132B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-2 border-[#0B132B] max-w-xl w-full p-8" style={{ boxShadow: "8px 8px 0 #0B132B" }} onClick={(e) => e.stopPropagation()}>
        <div className="overline text-[#D32F2F]">NCA broker ↔ cedente</div>
        <h3 className="font-display text-2xl font-semibold mt-1">Firma digital del mandato</h3>
        <div className="mt-4 text-xs text-slate-600 p-4 bg-[#F8FAFC] border border-[hsl(var(--border))] max-h-48 overflow-y-auto space-y-2">
          <p>El broker y la cedente acuerdan colaborar en la gestión del programa de reaseguro bajo estricta confidencialidad. La identidad de la cedente solo se revelará al broker tras la firma de ambas partes.</p>
          <p>Todas las comunicaciones quedan registradas en el audit log de RSM.</p>
        </div>
        <label className="flex items-start gap-2 text-sm mt-4"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> Acepto los términos</label>
        <div className="mt-4"><label className="rsm-label">Firmante</label><input className="rsm-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {err && <div className="text-xs text-[#D32F2F] mt-2">{err}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rsm-btn-outline" onClick={onClose}>{t("common.cancel")}</button>
          <button className="rsm-btn-primary" disabled={!accepted || !name.trim()} onClick={submit} data-testid="sign-mandate-confirm">{t("nca_modal.sign")}</button>
        </div>
      </div>
    </div>
  );
}
