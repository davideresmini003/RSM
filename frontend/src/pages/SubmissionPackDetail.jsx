import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, API, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { VerifiedBadge, AnonBadge, LossRatioPill } from "../components/ui-bits";
import { useToast } from "../components/Toast";
import { Lock, ArrowLeft, CheckCircle2, Building2, MapPin, Calendar, FileText } from "lucide-react";

export default function SubmissionPackDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [pack, setPack] = useState(null);
  const [previewFiles, setPreviewFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/marketplace/packs/${id}`);
      setPack(data.pack);
      // Fetch any preview files attached to this pack (visible pre-NCA)
      try {
        const { data: filesData } = await api.get(`/submission-packs/${id}/files`);
        setPreviewFiles((filesData.files || []).filter((f) => f.is_preview));
      } catch (_) { setPreviewFiles([]); }
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const expressInterest = async () => {
    setSending(true);
    try {
      await api.post("/interests", { pack_id: id, message });
      setModal(false);
      setMessage("");
      await load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-8 text-slate-400">{t("common.loading")}</div>;
  if (err) return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="border-l-4 border-[#D32F2F] bg-red-50 p-4 text-[#D32F2F]">{err}</div>
      <Link to="/app/marketplace" className="mt-4 inline-block overline text-slate-500 hover:text-[#0B132B]">← Marketplace</Link>
    </div>
  );
  if (!pack) return null;

  const isReasegurador = user?.role === "reasegurador";
  const alreadyExpressed = !!pack.own_interest;

  return (
    <div className="p-8 max-w-5xl mx-auto" data-testid="pack-detail-page">
      <Link to="/app/marketplace" className="overline text-slate-500 hover:text-[#0B132B] flex items-center gap-1">
        <ArrowLeft size={12} strokeWidth={2} /> Marketplace
      </Link>

      {/* Header */}
      <div className="mt-4 rsm-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono-data text-base font-bold">{pack.code}</span>
              {pack.verified && <VerifiedBadge />}
              <AnonBadge>Cedente anónimo</AnonBadge>
              {pack.broker_name && <span className="badge-anon">Broker: {pack.broker_name}</span>}
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight mt-4">{pack.title}</h1>
            <div className="mt-3 text-sm text-slate-600 flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1"><Building2 size={13} strokeWidth={1.5} /> {pack.branch}</span>
              <span className="flex items-center gap-1"><FileText size={13} strokeWidth={1.5} /> {pack.reinsurance_type}</span>
              <span className="flex items-center gap-1"><MapPin size={13} strokeWidth={1.5} /> {pack.country_region || pack.cedente_country || "—"}</span>
              <span className="flex items-center gap-1"><Calendar size={13} strokeWidth={1.5} /> {pack.coverage_period || "—"}</span>
            </div>
          </div>

          <div className="min-w-[240px]">
            {isReasegurador && !alreadyExpressed && (
              <button className="rsm-btn-primary w-full" onClick={() => setModal(true)} data-testid="detail-express-interest">
                {t("marketplace.express_interest")}
              </button>
            )}
            {isReasegurador && alreadyExpressed && (
              <div className="border border-[hsl(var(--border))] p-4 text-center">
                <CheckCircle2 size={20} className="mx-auto text-emerald-600" strokeWidth={1.5} />
                <div className="overline mt-2">Interés: {pack.own_interest}</div>
                <p className="text-xs text-slate-500 mt-1">Serás notificado cuando el cedente responda.</p>
              </div>
            )}
            {!isReasegurador && user?.role !== "admin" && (
              <div className="overline text-slate-400 text-center p-4 border border-[hsl(var(--border))]">Solo reaseguradores pueden expresar interés</div>
            )}
            {pack.interests_count != null && (
              <div className="mt-3 text-xs text-slate-500 text-center">
                {pack.interests_count} {pack.interests_count === 1 ? "reasegurador interesado" : "reaseguradores interesados"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-0 border-l border-t border-[hsl(var(--border))]">
        <KpiTile label="Cesión" value={`${pack.cession_pct}%`} />
        <KpiTile label="LR medio 3Y" value={`${pack.avg_loss_ratio}%`} pill={<LossRatioPill value={pack.avg_loss_ratio} />} />
        <KpiTile label="Prima Y-1" value={`€${Number(pack.premiums_y1 || 0).toLocaleString("es-ES")}`} />
        <KpiTile label="Publicado" value={pack.published_at ? new Date(pack.published_at).toLocaleDateString() : "—"} />
      </div>

      {/* Premiums and loss ratios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="rsm-card">
          <div className="overline mb-4">Histórico de primas brutas (EUR)</div>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Año -1", pack.premiums_y1],
                ["Año -2", pack.premiums_y2],
                ["Año -3", pack.premiums_y3],
              ].map(([label, val]) => (
                <tr key={label} className="border-b border-[hsl(var(--border))] last:border-b-0">
                  <td className="py-3 overline">{label}</td>
                  <td className="py-3 text-right font-mono-data font-semibold">€{Number(val || 0).toLocaleString("es-ES")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rsm-card">
          <div className="overline mb-4">Loss ratio histórico (%)</div>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Año -1", pack.loss_ratio_y1],
                ["Año -2", pack.loss_ratio_y2],
                ["Año -3", pack.loss_ratio_y3],
              ].map(([label, val]) => (
                <tr key={label} className="border-b border-[hsl(var(--border))] last:border-b-0">
                  <td className="py-3 overline">{label}</td>
                  <td className="py-3 text-right"><LossRatioPill value={val ?? 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Description */}
      {pack.description && (
        <div className="rsm-card mt-6">
          <div className="overline mb-3">Descripción del riesgo</div>
          <p className="text-base leading-relaxed text-slate-700 whitespace-pre-line">{pack.description}</p>
        </div>
      )}

      {/* PREVIEW documents — visible BEFORE NCA */}
      {previewFiles.length > 0 && (
        <div className="rsm-card mt-6 border-l-4 border-[#0B132B]" data-testid="pre-nca-preview-section">
          <div className="overline text-[#0B132B] mb-3">Documento de presentación · pre-NCA</div>
          <p className="text-xs text-slate-500 mb-4">
            La cedente ha adjuntado un documento informativo accesible <b>antes</b> de firmar el NCA, para ayudarte a decidir si expresar interés.
          </p>
          <div className="space-y-2">
            {previewFiles.map((pf) => (
              <div key={pf.id} className="flex items-center justify-between border border-[hsl(var(--border))] p-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={14} className="text-slate-400 shrink-0" strokeWidth={1.5} />
                  <span className="truncate">{pf.filename}</span>
                  <span className="text-xs text-slate-400 font-mono-data shrink-0">({(pf.size / 1024).toFixed(1)} KB)</span>
                </div>
                <a
                  href={`${API}/pack-files/${pf.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="overline text-[#0B132B] hover:text-[#D32F2F] shrink-0 ml-3"
                  data-testid="pre-nca-preview-download"
                >Descargar →</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents notice */}
      <div className="rsm-card mt-6 border-l-4 border-[#FCD34D]">
        <div className="flex items-start gap-3">
          <Lock size={20} className="text-[#92400E] shrink-0 mt-1" strokeWidth={1.5} />
          <div>
            <div className="overline text-[#92400E]">Documentos post-NCA</div>
            <p className="text-sm text-slate-700 mt-2">
              Los documentos adjuntos (SFCR, histórico de siniestros, exposición geográfica, etc.) quedan clasificados como <b>post-NCA</b>. Solo se harán visibles una vez firmado digitalmente el NCA por ambas partes.
            </p>
          </div>
        </div>
      </div>

      {/* CTA bottom (mobile-friendly reminder) */}
      {isReasegurador && !alreadyExpressed && (
        <div className="mt-8 flex justify-end">
          <button className="rsm-btn-primary" onClick={() => setModal(true)} data-testid="detail-express-interest-bottom">
            {t("marketplace.express_interest")}
          </button>
        </div>
      )}

      {/* Interest modal */}
      {modal && (
        <div className="fixed inset-0 bg-[#0B132B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModal(false)}>
          <div className="bg-white border-2 border-[#0B132B] max-w-lg w-full p-8" style={{ boxShadow: "8px 8px 0 #0B132B" }} onClick={(e) => e.stopPropagation()}>
            <div className="overline">Expresar interés</div>
            <h3 className="font-display text-2xl font-semibold mt-1">{pack.code}</h3>
            <p className="text-sm text-slate-600 mt-2">{pack.title}</p>
            <p className="text-xs text-slate-500 mt-4">
              El cedente recibirá tu manifestación de interés de forma anónima. Si la acepta, se generará automáticamente un NCA para firmar digitalmente por ambas partes.
            </p>
            <label className="rsm-label mt-5">Mensaje (opcional, máx. 500 caracteres)</label>
            <textarea className="rsm-input" rows={4} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="detail-interest-message" />
            <div className="mt-6 flex justify-end gap-3">
              <button className="rsm-btn-outline" onClick={() => setModal(false)} disabled={sending}>{t("common.cancel")}</button>
              <button className="rsm-btn-primary" onClick={expressInterest} disabled={sending} data-testid="detail-confirm-interest">
                {sending ? t("common.loading") : t("marketplace.express_interest")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, pill }) {
  return (
    <div className="border-r border-b border-[hsl(var(--border))] p-5">
      <div className="overline">{label}</div>
      {pill ? <div className="mt-3">{pill}</div> : <div className="mt-3 font-mono-data text-2xl font-semibold text-[#0B132B]">{value}</div>}
    </div>
  );
}
