import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, API, formatApiError } from "../lib/api";
import { useToast } from "../components/Toast";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { log } from "../lib/log";
import { markChatRead } from "../lib/notifications";
import { Timeline } from "../components/Timeline";
import { VerifiedBadge, AnonBadge, Tooltip } from "../components/ui-bits";
import { Lock, FileSignature, Send, Star, Paperclip, X, FileText as FileIcon } from "lucide-react";

export default function OperationDetail() {
  const { id } = useParams();
  const { user, company } = useAuth();
  const { t } = useI18n();
  const [op, setOp] = useState(null);
  const [tab, setTab] = useState(null);
  const [ncaModal, setNcaModal] = useState(false);
  const [contractModal, setContractModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const toast = useToast();
  const [err, setErr] = useState("");
  const [unreadChat, setUnreadChat] = useState(false);
  const chatLastSeenAt = useRef(null);

  const load = useCallback(
    () => api.get(`/operations/${id}`).then(({ data }) => {
      setOp(data.operation);
      setTab((prev) => prev ?? (data.operation.state === "nca_pending" ? "chat" : "overview"));
    }),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (!op) return <div className="p-8">{t("common.loading")}</div>;

  const userCompanyId = company?.id;
  // Match by user ID or by company (any user from the same company can sign)
  const isCedente = op.cedente_user_id === user.id || (userCompanyId && userCompanyId === op.cedente_company_id);
  const isRea = op.reasegurador_user_id === user.id || (userCompanyId && userCompanyId === op.reasegurador_company_id);
  const isBroker = op.broker_user_id === user.id;

  const needsMySign = (isCedente && !op.nca_signed_cedente) || (isRea && !op.nca_signed_reasegurador);
  const bothSigned = op.nca_signed_cedente && op.nca_signed_reasegurador;

  const counter = (() => {
    if (isCedente) return op.revealed ? op.reasegurador_company?.name : "Reasegurador anónimo";
    if (isRea) return op.revealed ? op.cedente_company?.name : "Cedente anónimo";
    if (isBroker) return op.revealed ? `${op.cedente_company?.name} ↔ ${op.reasegurador_company?.name}` : "Partes anónimas";
    return `${op.cedente_company?.name} ↔ ${op.reasegurador_company?.name}`;
  })();

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="operation-detail">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/app/operations" className="overline text-slate-500 hover:text-[#0B132B]">← Operaciones</Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight mt-2 flex items-center gap-3">
            {op.code}
            {!op.revealed && <Lock size={20} strokeWidth={1.5} className="text-slate-400" />}
          </h1>
          <div className="mt-2 text-sm text-slate-600">{counter}</div>
        </div>
        <div className="flex gap-2">
          {op.revealed ? <VerifiedBadge>IDENTIFICADO</VerifiedBadge> : <AnonBadge>ANÓNIMO</AnonBadge>}
          {op.suspended && <span className="badge-pending bg-red-50 border-red-300 text-red-800">SUSPENDIDA</span>}
        </div>
      </div>

      <div className="mt-8 rsm-card">
        <Timeline state={op.state} />
      </div>

      {op.state === "nca_pending" && !op.nca_signed_cedente && !op.nca_signed_reasegurador && (
        <div className="mt-4 border border-[#FCD34D] bg-[#FFFBEB] px-5 py-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock size={16} className="text-[#92400E] mt-0.5 shrink-0" />
            <div className="text-sm text-[#92400E]">
              <span className="font-semibold">Chat anónimo abierto.</span> Las identidades permanecen ocultas. Conversad sin revelar el nombre de vuestra empresa. Cuando estéis listos, firmad el NCA para pasar a la fase de cotización.
            </div>
          </div>
          <button className="rsm-btn-outline text-xs shrink-0" onClick={() => setTab("chat")}>Ir al chat</button>
        </div>
      )}
      {op.state === "nca_pending" && (op.nca_signed_cedente !== op.nca_signed_reasegurador) && (
        <div className="mt-4 border-l-4 border-blue-400 bg-blue-50 px-5 py-3 text-sm text-blue-800">
          Una parte ha firmado el NCA. Esperando la firma de la otra parte.
        </div>
      )}

      {/* Tabs */}
      <div className="mt-8 flex border-b border-[hsl(var(--border))]">
        {["overview", "nca", "quote", "chat", "documents"].map((k) => {
          const locked = !bothSigned && (k === "quote" || k === "documents");
          const isChat = k === "chat";
          return (
            <button
              key={k}
              onClick={() => {
                if (locked) { toast.info("Firma el NCA primero para acceder a esta sección."); return; }
                if (isChat) { chatLastSeenAt.current = new Date().toISOString(); setUnreadChat(false); }
                setTab(k);
              }}
              className={`relative px-6 py-3 text-xs uppercase tracking-wider font-semibold transition-colors flex items-center gap-1.5
                ${tab === k ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500 hover:text-[#0B132B]"}
                ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
              data-testid={`tab-${k}`}
            >
              {k === "overview" && t("operation.overview")}
              {k === "nca" && "NCA"}
              {k === "quote" && <>{t("operation.quote_section")}{locked && <Lock size={11} strokeWidth={2} />}</>}
              {k === "chat" && (
                <>
                  {t("operation.chat_section")}
                  {unreadChat && <span className="w-2 h-2 rounded-full bg-[#D32F2F] shrink-0" />}
                </>
              )}
              {k === "documents" && <>{t("operation.documents_section")}{locked && <Lock size={11} strokeWidth={2} />}</>}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "overview" && <Overview op={op} />}
        {tab === "nca" && <NcaSection op={op} needsMySign={needsMySign} bothSigned={bothSigned} onSign={() => setNcaModal(true)} />}
        {tab === "quote" && <QuoteSection op={op} user={user} reload={load} />}
        {tab !== "chat" && <UnreadChatWatcher op={op} chatLastSeenAt={chatLastSeenAt} onUnread={() => setUnreadChat(true)} />}
        {tab === "chat" && <ChatSection op={op} user={user} />}
        {tab === "documents" && <DocumentsSection op={op} bothSigned={bothSigned} />}
      </div>

      {op.state === "closed" && isCedente && op.broker_user_id && (
        <div className="mt-6 border-t border-[hsl(var(--border))] pt-6">
          <button className="rsm-btn-outline" onClick={() => setRateModal(true)} data-testid="btn-rate-broker">
            <Star size={14} className="inline mr-2" /> {t("operation.rate_broker")}
          </button>
        </div>
      )}

      {op.quote && !op.quote.accepted && bothSigned &&
        ((isCedente && op.quote.sender_role !== "cedente") || (isRea && op.quote.sender_role !== "reasegurador")) && (
        <div className="mt-6 border border-[hsl(var(--border))] bg-[#F8FAFC] p-6">
          <div className="overline">{t("operation.action_required")}</div>
          <p className="text-sm mt-2 mb-4">Hay una cotización pendiente de tu parte. Revísala en la pestaña Cotización y acéptala para generar el contrato, o responde con una contra-oferta.</p>
          <button className="rsm-btn-primary" onClick={async () => { await api.post(`/operations/${id}/accept-quote`); load(); }} data-testid="accept-quote">{t("operation.accept_quote")}</button>
        </div>
      )}

      {op.contract && !(op.contract.signed_cedente && op.contract.signed_reasegurador) && (isCedente || isRea) && (
        <div className="mt-6 border border-[hsl(var(--border))] bg-[#F8FAFC] p-6">
          <div className="overline">{t("operation.contract_pending")}</div>
          <p className="text-sm mt-2 mb-4">
            Firmas: cedente {op.contract.signed_cedente ? "✓" : "—"} · reasegurador {op.contract.signed_reasegurador ? "✓" : "—"}
          </p>
          {((isCedente && !op.contract.signed_cedente) || (isRea && !op.contract.signed_reasegurador)) && (
            <button className="rsm-btn-primary" onClick={() => setContractModal(true)} data-testid="btn-sign-contract">{t("operation.sign_contract")}</button>
          )}
        </div>
      )}

      {ncaModal && <SignModal type="nca" onClose={() => setNcaModal(false)} onSign={async (name) => {
        try { await api.post(`/operations/${id}/sign-nca`, { operation_id: id, signer_name: name, accepted: true }); setNcaModal(false); load(); toast.success("NCA firmado correctamente."); }
        catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
      }} />}
      {contractModal && <SignModal type="contract" onClose={() => setContractModal(false)} onSign={async (name) => {
        try { await api.post(`/operations/${id}/sign-contract`, { operation_id: id, signer_name: name, accepted: true }); setContractModal(false); load(); toast.success("Contrato firmado correctamente."); }
        catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
      }} />}
      {rateModal && <RateModal op={op} onClose={() => setRateModal(false)} onDone={() => { setRateModal(false); load(); }} />}
    </div>
  );
}

function Overview({ op }) {
  const { t } = useI18n();
  const pack = op.pack || {};
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="rsm-card">
        <div className="overline mb-3">Submission Pack</div>
        <div className="font-mono-data font-semibold">{op.pack_code}</div>
        <div className="font-display text-xl mt-2">{pack.title}</div>
        <div className="mt-3 text-xs text-slate-600 space-y-1">
          <div>Ramo: {pack.branch}</div>
          <div>Tipo: {pack.reinsurance_type}</div>
          <div>País: {pack.country_region || "—"}</div>
          <div>Cesión: {pack.cession_pct}%</div>
          <div>LR medio: {(((pack.loss_ratio_y1||0)+(pack.loss_ratio_y2||0)+(pack.loss_ratio_y3||0))/3).toFixed(1)}%</div>
        </div>
      </div>
      <div className="rsm-card">
        <div className="overline mb-3">Partes</div>
        <div className="space-y-3 text-sm">
          <div>
            <div className="overline">Cedente</div>
            <div className={!op.revealed ? "locked-blur" : "font-semibold"}>{op.cedente_company?.name || "—"}</div>
          </div>
          <div>
            <div className="overline">Reasegurador</div>
            <div className={!op.revealed ? "locked-blur" : "font-semibold"}>{op.reasegurador_company?.name || "—"}</div>
          </div>
          {op.broker_user_id && (
            <div>
              <div className="overline">Broker</div>
              <div className="font-semibold">Intermediario asignado</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NcaSection({ op, needsMySign, bothSigned, onSign }) {
  const { t } = useI18n();
  const noSignatures = !op.nca_signed_cedente && !op.nca_signed_reasegurador;
  return (
    <div className="rsm-card">
      <div className="overline">{t("operation.nca_section")}</div>
      <h3 className="font-display text-xl font-semibold mt-2">Estado</h3>

      {noSignatures && (
        <div className="mt-4 border-l-4 border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E] flex items-start gap-2">
          <Lock size={12} className="mt-0.5 shrink-0" />
          <span>{t("operation.nca_after_chat")}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="border border-[hsl(var(--border))] p-4">
          <div className="overline">Cedente</div>
          <div className="mt-2 font-mono-data">{op.nca_signed_cedente ? `✓ ${op.nca_signer_cedente}` : "—"}</div>
          <div className="text-xs text-slate-400 mt-1">{op.nca_signed_at_cedente ? new Date(op.nca_signed_at_cedente).toLocaleString() : ""}</div>
        </div>
        <div className="border border-[hsl(var(--border))] p-4">
          <div className="overline">Reasegurador</div>
          <div className="mt-2 font-mono-data">{op.nca_signed_reasegurador ? `✓ ${op.nca_signer_reasegurador}` : "—"}</div>
          <div className="text-xs text-slate-400 mt-1">{op.nca_signed_at_reasegurador ? new Date(op.nca_signed_at_reasegurador).toLocaleString() : ""}</div>
        </div>
      </div>
      {bothSigned && <div className="mt-4 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-3">{t("operation.both_signed")}</div>}
      {needsMySign && (
        <button className="rsm-btn-primary mt-6" onClick={onSign} data-testid="btn-sign-nca">
          <FileSignature size={14} className="inline mr-2" /> {t("operation.sign_nca")}
        </button>
      )}
    </div>
  );
}

function QuoteSection({ op, user, reload }) {
  const { t } = useI18n();
  const toast = useToast();
  const userCompanyId = user.company_id;
  const isRea = op.reasegurador_user_id === user.id ||
    (userCompanyId && userCompanyId === op.reasegurador_company_id);
  const isCedente = op.cedente_user_id === user.id ||
    (userCompanyId && userCompanyId === op.cedente_company_id);
  const both = op.nca_signed_cedente && op.nca_signed_reasegurador;
  const [showForm, setShowForm] = useState(false);
  const q0 = op.quote;
  const [form, setForm] = useState({
    reinsurance_type: q0?.reinsurance_type || op.pack?.reinsurance_type || "",
    offered_share_pct: q0?.offered_share_pct ?? 30,
    ceding_commission_pct: q0?.ceding_commission_pct ?? 28,
    rate_on_line_pct: q0?.rate_on_line_pct ?? 0,
    attachment_point: q0?.attachment_point ?? 0,
    limit_eur: q0?.limit_eur ?? 0,
    estimated_premium_eur: q0?.estimated_premium_eur ?? 0,
    profit_commission_pct: q0?.profit_commission_pct ?? 0,
    sliding_scale: false, sliding_min: 0, sliding_max: 0,
    exclusions: q0?.exclusions || "", special_conditions: q0?.special_conditions || "",
    expiry_date: q0?.expiry_date || "",
  });
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (!both) return <div className="rsm-card text-sm text-slate-500">{t("operation.chat_locked")}</div>;

  const canParticipate = isRea || isCedente;
  const lastSenderRole = op.quote?.sender_role;
  // A party can counter-offer if the last quote wasn't sent by them
  const canCounter = canParticipate && op.quote && !op.quote.accepted && !!lastSenderRole && lastSenderRole !== user.role;
  const isMyTurn = canParticipate && (!op.quote || canCounter);

  const senderLabel = lastSenderRole === "cedente" ? "cedente" : lastSenderRole === "reasegurador" ? "reasegurador" : "la otra parte";

  const QuoteForm = () => (
    <div className="mt-6 border-t border-[hsl(var(--border))] pt-6">
      <div className="overline mb-3">
        {op.quote ? t("operation.send_counter_offer") : (isRea ? t("quote.title") : "Enviar propuesta")}
      </div>
      {op.quote && (
        <div className="mb-4 border-l-4 border-[#FCD34D] bg-[#FFFBEB] p-3 text-xs">
          {t("operation.replying_to")}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div><label className="rsm-label">Tipo</label><input className="rsm-input" value={form.reinsurance_type} onChange={(e) => upd("reinsurance_type", e.target.value)} /></div>
        <div><label className="rsm-label">{t("quote.offered_share")}</label><input type="number" min="0" max="100" className="rsm-input" value={form.offered_share_pct} onChange={(e) => upd("offered_share_pct", Number(e.target.value))} data-testid="quote-share" /></div>
        <div>
          <label className="rsm-label flex items-center gap-1">
            {t("quote.ceding_commission")}
            <Tooltip content="Comisión que el reasegurador paga a la cedente por la cartera cedida.">ⓘ</Tooltip>
          </label>
          <input type="number" min="0" className="rsm-input" value={form.ceding_commission_pct} onChange={(e) => upd("ceding_commission_pct", Number(e.target.value))} />
        </div>
        <div>
          <label className="rsm-label flex items-center gap-1">
            {t("quote.rate_on_line")}
            <Tooltip content="Porcentaje de la prima sobre el límite de cobertura. Típico en XL no proporcional.">ⓘ</Tooltip>
          </label>
          <input type="number" min="0" className="rsm-input" value={form.rate_on_line_pct} onChange={(e) => upd("rate_on_line_pct", Number(e.target.value))} />
        </div>
        <div>
          <label className="rsm-label flex items-center gap-1">
            {t("quote.attachment_point")}
            <Tooltip content="Umbral de siniestros acumulados a partir del cual entra en juego el reasegurador.">ⓘ</Tooltip>
          </label>
          <input type="number" min="0" className="rsm-input" value={form.attachment_point} onChange={(e) => upd("attachment_point", Number(e.target.value))} />
        </div>
        <div><label className="rsm-label">{t("quote.limit")}</label><input type="number" min="0" className="rsm-input" value={form.limit_eur} onChange={(e) => upd("limit_eur", Number(e.target.value))} /></div>
        <div><label className="rsm-label">{t("quote.estimated_premium")}</label><input type="number" min="0" className="rsm-input" value={form.estimated_premium_eur} onChange={(e) => upd("estimated_premium_eur", Number(e.target.value))} /></div>
        <div>
          <label className="rsm-label flex items-center gap-1">
            {t("quote.profit_commission")}
            <Tooltip content="Comisión variable que el reasegurador paga si el negocio resulta rentable al cierre del ejercicio.">ⓘ</Tooltip>
          </label>
          <input type="number" min="0" className="rsm-input" value={form.profit_commission_pct} onChange={(e) => upd("profit_commission_pct", Number(e.target.value))} />
        </div>
        <div><label className="rsm-label">{t("quote.expiry_date")}</label><input type="date" min={new Date().toISOString().split("T")[0]} className="rsm-input" value={form.expiry_date} onChange={(e) => upd("expiry_date", e.target.value)} /></div>
      </div>
      <div className="mt-4">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={form.sliding_scale} onChange={(e) => upd("sliding_scale", e.target.checked)} />
          {t("quote.sliding_scale")}
        </label>
        {form.sliding_scale && (
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div><label className="rsm-label">{t("quote.sliding_min")}</label><input type="number" min="0" max="100" className="rsm-input" value={form.sliding_min} onChange={(e) => upd("sliding_min", Number(e.target.value))} /></div>
            <div><label className="rsm-label">{t("quote.sliding_max")}</label><input type="number" min="0" max="100" className="rsm-input" value={form.sliding_max} onChange={(e) => upd("sliding_max", Number(e.target.value))} /></div>
          </div>
        )}
      </div>
      <div className="mt-4"><label className="rsm-label">{t("quote.exclusions")}</label><textarea className="rsm-input" rows={3} value={form.exclusions} onChange={(e) => upd("exclusions", e.target.value)} /></div>
      <div className="mt-4"><label className="rsm-label">{t("quote.special_conditions")}</label><textarea className="rsm-input" rows={3} value={form.special_conditions} onChange={(e) => upd("special_conditions", e.target.value)} /></div>
      <div className="mt-6 flex gap-3">
        <button className="rsm-btn-primary" data-testid="btn-submit-quote" onClick={async () => {
          try {
            await api.post(`/operations/${op.id}/quote`, { operation_id: op.id, ...form });
            setShowForm(false); reload(); toast.success("Cotización enviada.");
          } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
        }}>{op.quote ? t("operation.send_counter_offer") : t("operation.submit_quote")}</button>
        {op.quote && <button className="rsm-btn-outline" onClick={() => setShowForm(false)}>Cancelar</button>}
      </div>
    </div>
  );

  if (op.quote) {
    const q = op.quote;
    const history = op.quote_history || [];
    const prevQuotes = history.filter((h) => h.id !== q.id);
    const nameOf = (role) => role === "cedente" ? (op.cedente_company?.name || "Cedente") : role === "reasegurador" ? (op.reasegurador_company?.name || "Reasegurador") : "—";
    return (
      <div className="space-y-4">
        {prevQuotes.length > 0 && (
          <div className="space-y-3">
            <div className="overline text-slate-400">Historial de negociación</div>
            {prevQuotes.map((h) => (
              <div key={h.id} className="rsm-card bg-[#F8FAFC] opacity-70">
                <div className="flex items-center justify-between">
                  <div className="overline text-slate-400">v{h.version} · {nameOf(h.sender_role)}</div>
                  <div className="text-xs text-slate-400">{new Date(h.created_at).toLocaleString()}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs text-slate-500">
                  <span>{h.reinsurance_type} · {h.offered_share_pct}%</span>
                  <span>Ceding {h.ceding_commission_pct}%</span>
                  <span>RoL {h.rate_on_line_pct}%</span>
                  <span>Límite €{Number(h.limit_eur||0).toLocaleString()}</span>
                  <span>Prima €{Number(h.estimated_premium_eur||0).toLocaleString()}</span>
                  <span>Expira {h.expiry_date || "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rsm-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="overline">
                Cotización {q.accepted ? "✓ aceptada" : `pendiente${q.version > 1 ? ` · v${q.version}` : ""}`}
                {q.sender_role && <span className="ml-2 text-slate-400">· enviada por {nameOf(q.sender_role)}</span>}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{new Date(q.created_at).toLocaleString()}</div>
            </div>
            {!q.accepted && canCounter && (
              <button className="rsm-btn-outline text-xs" onClick={() => setShowForm((v) => !v)} data-testid="btn-counter-quote">
                {showForm ? t("common.cancel") : t("operation.counter_offer")}
              </button>
            )}
          </div>
          {!q.accepted && !canCounter && canParticipate && (
            <div className="mt-3 border-l-4 border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              {t("operation.quote_sent_waiting")}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <DataItem label="Tipo" value={q.reinsurance_type} />
            <DataItem label="Share" value={`${q.offered_share_pct}%`} />
            <DataItem label="Ceding comm." value={`${q.ceding_commission_pct}%`} />
            <DataItem label="Rate on Line" value={`${q.rate_on_line_pct}%`} />
            <DataItem label="Attachment" value={`€${Number(q.attachment_point||0).toLocaleString()}`} />
            <DataItem label="Limit" value={`€${Number(q.limit_eur||0).toLocaleString()}`} />
            <DataItem label="Premium" value={`€${Number(q.estimated_premium_eur||0).toLocaleString()}`} />
            <DataItem label="Profit comm." value={`${q.profit_commission_pct}%`} />
            <DataItem label="Expira" value={q.expiry_date || "—"} />
          </div>
          {q.exclusions && <div className="mt-4"><div className="overline">Exclusiones</div><p className="text-sm mt-2">{q.exclusions}</p></div>}
          {q.special_conditions && <div className="mt-4"><div className="overline">Condiciones especiales</div><p className="text-sm mt-2">{q.special_conditions}</p></div>}
          {!q.accepted && canCounter && showForm && <QuoteForm />}
        </div>
      </div>
    );
  }

  if (canParticipate) {
    return (
      <div className="rsm-card">
        <QuoteForm />
      </div>
    );
  }

  return <div className="rsm-card text-sm text-slate-500">{t("operation.waiting_quote")}</div>;
}

function DataItem({ label, value }) {
  return (
    <div>
      <div className="overline">{label}</div>
      <div className="font-mono-data font-semibold mt-1">{value}</div>
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function UnreadChatWatcher({ op, chatLastSeenAt, onUnread }) {
  const channel = op.broker_user_id ? "broker-cedente" : "cedente-reasegurador";
  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await api.get(`/messages/${op.id}`, { params: { channel } });
        const msgs = data.messages || [];
        if (!msgs.length) return;
        const latest = msgs[msgs.length - 1].created_at;
        if (!chatLastSeenAt.current || latest > chatLastSeenAt.current) {
          onUnread();
        }
      } catch (_) {}
    };
    check();
    const i = setInterval(check, 8000);
    return () => clearInterval(i);
  }, [op.id, channel, chatLastSeenAt, onUnread]);
  return null;
}

function ChatSection({ op, user }) {
  const { t } = useI18n();
  const toast = useToast();
  const hasBroker = !!op.broker_user_id;
  const isBroker = op.broker_user_id === user.id;

  const defaultChannel = (() => {
    if (!hasBroker) return "cedente-reasegurador";
    if (user.role === "cedente") return "broker-cedente";
    if (user.role === "reasegurador") return "broker-reasegurador";
    return "broker-cedente";
  })();
  const [channel, setChannel] = useState(defaultChannel);
  const [msgs, setMsgs] = useState([]);
  const [preNca, setPreNca] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/messages/${op.id}`, { params: { channel } });
      setMsgs(data.messages || []);
      setPreNca(!!data.pre_nca);
      setChatError(false);
      markChatRead(op.id);
    } catch (e) {
      log.warn("Message load failed:", e.message);
      setChatError(true);
    }
  }, [op.id, channel]);
  useEffect(() => { load(); const i = setInterval(load, 4000); return () => clearInterval(i); }, [load]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [msgs]);

  const send = async () => {
    if (!text.trim() && !pendingFile) return;
    setSending(true);
    try {
      if (pendingFile) {
        const fd = new FormData();
        fd.append("operation_id", op.id);
        fd.append("channel", channel);
        fd.append("text", text);
        fd.append("file", pendingFile);
        await api.post("/messages/upload", fd);
      } else {
        await api.post("/messages", { operation_id: op.id, channel, text });
      }
      setText("");
      setPendingFile(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rsm-card">
      {chatError && (
        <div className="mb-4 border-l-4 border-red-400 bg-red-50 px-4 py-3 text-xs text-red-700">
          No se pudo cargar el chat. Reintentando…
        </div>
      )}
      {preNca && (
        <div className="mb-4 border-l-4 border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-xs text-[#92400E] flex items-start gap-2">
          <Lock size={12} className="mt-0.5 shrink-0" />
          <span>{t("operation.chat_open_banner")}</span>
        </div>
      )}
      {hasBroker && (
        <div className="flex border-b border-[hsl(var(--border))] mb-4">
          {isBroker ? (
            <>
              <button className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold ${channel === "broker-cedente" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} onClick={() => setChannel("broker-cedente")} data-testid="tab-broker-cedente">{t("operation.tab_with_cedente")}</button>
              <button className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold ${channel === "broker-reasegurador" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} onClick={() => setChannel("broker-reasegurador")} data-testid="tab-broker-reasegurador">{t("operation.tab_with_reasegurador")}</button>
            </>
          ) : (user.role === "cedente" || user.role === "reasegurador") ? (
            <button className="px-4 py-2 text-xs uppercase tracking-wider font-semibold border-b-2 border-[#0B132B] text-[#0B132B]" data-testid="tab-with-broker">{t("operation.tab_with_broker")}</button>
          ) : null}
        </div>
      )}
      <div ref={listRef} className="h-96 overflow-y-auto border border-[hsl(var(--border))] p-4 bg-[#F8FAFC]" data-testid="chat-messages">
        {msgs.length === 0 && (
          <div className="text-center text-slate-400 text-sm py-16">
            {preNca ? "Chat anónimo abierto. Escribe para iniciar la conversación." : "Sin mensajes."}
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === user.id;
          const label = (() => {
            if (preNca) {
              if (m.sender_role === "cedente") return "Cedente Anónimo 🔒";
              if (m.sender_role === "reasegurador") return "Reasegurador Anónimo 🔒";
              return "Broker 🔒";
            }
            if (m.sender_role === "cedente") return op.cedente_company?.name || "Cedente";
            if (m.sender_role === "reasegurador") return op.reasegurador_company?.name || "Reasegurador";
            return "Broker";
          })();
          return (
            <div key={m.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${mine ? "bg-[#0B132B] text-white" : "bg-white border border-[hsl(var(--border))]"} p-3`}>
                {!mine && <div className="overline text-[10px] mb-1 opacity-70">{label}</div>}
                {m.text && <div className="text-sm">{m.text}</div>}
                {m.attachment && (
                  <div className={`mt-2 ${m.text ? "mt-2" : ""}`}>
                    {m.attachment.content_type?.startsWith("image/") ? (
                      <a href={`${API}/messages/${m.id}/attachment`} target="_blank" rel="noreferrer">
                        <img
                          src={`${API}/messages/${m.id}/attachment`}
                          alt={m.attachment.filename}
                          className="max-w-full rounded border border-white/20"
                          style={{ maxHeight: 200 }}
                        />
                      </a>
                    ) : (
                      <a
                        href={`${API}/messages/${m.id}/attachment`}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex items-center gap-2 text-xs underline ${mine ? "text-blue-200" : "text-blue-600"}`}
                      >
                        <FileIcon size={12} />
                        <span>{m.attachment.filename}</span>
                        <span className="opacity-60">({formatFileSize(m.attachment.size)})</span>
                      </a>
                    )}
                  </div>
                )}
                <div className="text-[10px] opacity-60 mt-1 font-mono-data">{new Date(m.created_at).toLocaleTimeString()}</div>
              </div>
            </div>
          );
        })}
      </div>
      {pendingFile && (
        <div className="mt-2 flex items-center gap-2 border border-[hsl(var(--border))] bg-slate-50 px-3 py-2 text-xs">
          <FileIcon size={12} className="text-slate-500" />
          <span className="flex-1 truncate">{pendingFile.name} <span className="text-slate-400">({formatFileSize(pendingFile.size)})</span></span>
          <button onClick={() => setPendingFile(null)} className="text-slate-400 hover:text-red-500"><X size={12} /></button>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <input
          type="file"
          ref={fileRef}
          className="hidden"
          onChange={(e) => { if (e.target.files[0]) setPendingFile(e.target.files[0]); e.target.value = ""; }}
        />
        <button
          className="px-3 py-2 border border-[hsl(var(--border))] text-slate-500 hover:text-[#0B132B] hover:border-[#0B132B] transition-colors"
          onClick={() => fileRef.current?.click()}
          title="Adjuntar archivo"
        >
          <Paperclip size={14} />
        </button>
        <input
          className="rsm-input flex-1"
          placeholder={preNca ? "Mensaje anónimo…" : "Escribe un mensaje…"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          data-testid="chat-input"
        />
        <button className="rsm-btn-primary" onClick={send} disabled={sending} data-testid="chat-send">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

function DocumentsSection({ op, bothSigned }) {
  const toast = useToast();
  const [docs, setDocs] = useState([]);
  const [packFiles, setPackFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/messages/${op.id}`, { params: { channel: "documents" } });
      setDocs((data.messages || []).filter((m) => m.attachment));
    } catch (_) {}
    try {
      const { data } = await api.get(`/submission-packs/${op.pack_id}/files`);
      setPackFiles(data.files || []);
    } catch (_) {}
  }, [op.id, op.pack_id]);

  useEffect(() => { if (bothSigned) load(); }, [bothSigned, load]);

  const upload = async (file) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("operation_id", op.id);
      fd.append("channel", "documents");
      fd.append("text", file.name);
      fd.append("file", file);
      await api.post("/messages/upload", fd);
      load();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rsm-card">
      <div className="flex items-center justify-between">
        <div className="overline">Documentos post-NCA</div>
        {bothSigned && (
          <>
            <input type="file" ref={fileRef} className="hidden" onChange={(e) => { if (e.target.files[0]) upload(e.target.files[0]); e.target.value = ""; }} />
            <button className="rsm-btn-outline text-xs flex items-center gap-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Paperclip size={12} /> {uploading ? "Subiendo…" : "Subir documento"}
            </button>
          </>
        )}
      </div>
      {!bothSigned && (
        <div className="mt-4 text-sm text-slate-400 py-6 text-center border border-[hsl(var(--border))]">
          <Lock size={16} className="inline mr-2" strokeWidth={1.5} />Firma el NCA para subir y ver documentos
        </div>
      )}
      {bothSigned && (
        <>
          {/* Pack original docs (uploaded by cedente at publication) */}
          <div className="mt-6">
            <div className="overline mb-2">Documentación del Submission Pack ({packFiles.length})</div>
            {packFiles.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center border border-[hsl(var(--border))]">La cedente no adjuntó documentos en la publicación.</div>
            ) : (
              <div className="space-y-2">
                {packFiles.map((pf) => (
                  <div key={pf.id} className="flex items-center justify-between border border-[hsl(var(--border))] p-3 text-sm" data-testid={`pack-file-${pf.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{pf.filename}</span>
                      <span className="text-xs text-slate-400 font-mono-data shrink-0">({formatFileSize(pf.size)})</span>
                    </div>
                    <a
                      href={`${API}/pack-files/${pf.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="overline text-[#0B132B] hover:text-[#D32F2F] shrink-0 ml-3"
                      data-testid={`download-pack-file-${pf.id}`}
                    >Descargar →</a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Docs uploaded during negotiation */}
          <div className="mt-6">
            <div className="overline mb-2">Documentos compartidos en la negociación ({docs.length})</div>
            {docs.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center border border-[hsl(var(--border))]">No hay documentos compartidos todavía.</div>
            ) : (
              <div className="space-y-2">
                {docs.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border border-[hsl(var(--border))] p-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{m.attachment.filename}</span>
                      <span className="text-xs text-slate-400 font-mono-data shrink-0">({formatFileSize(m.attachment.size)})</span>
                      <span className="text-xs text-slate-500 shrink-0">· {m.sender_name}</span>
                    </div>
                    <a
                      href={`${API}/messages/${m.id}/attachment`}
                      target="_blank"
              rel="noreferrer"
              className="overline text-[#0B132B] hover:underline text-[10px]"
            >
              Descargar
            </a>
          </div>
        ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SignModal({ type = "nca", onClose, onSign }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const k = type === "contract" ? "contract_modal" : "nca_modal";
  return (
    <div className="fixed inset-0 bg-[#0B132B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-2 border-[#0B132B] max-w-2xl w-full p-8" style={{ boxShadow: "8px 8px 0 #0B132B" }} onClick={(e) => e.stopPropagation()}>
        <div className="overline text-[#D32F2F]">Documento legal · eIDAS</div>
        <h2 className="font-display text-2xl font-semibold mt-1">{t(`${k}.title`)}</h2>
        <div className="mt-4 text-xs text-slate-600 space-y-2 max-h-48 overflow-y-auto border border-[hsl(var(--border))] p-4 bg-[#F8FAFC]">
          <p>{t(`${k}.intro`)}</p>
          <p>{t(`${k}.terms_1`)}</p>
          <p>{t(`${k}.terms_2`)}</p>
          <p>{t(`${k}.terms_3`)}</p>
          <p>{t(`${k}.terms_4`)}</p>
        </div>
        <label className="flex items-start gap-3 text-sm mt-4">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="modal-accept" />
          <span>{t(`${k}.accept`)}</span>
        </label>
        <div className="mt-4"><label className="rsm-label">{t(`${k}.signer_name`)}</label><input className="rsm-input" value={name} onChange={(e) => setName(e.target.value)} data-testid="modal-signer" /></div>
        <div className="mt-2 text-xs text-slate-500 font-mono-data">{t(`${k}.timestamp`)}: {new Date().toISOString()}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="rsm-btn-outline" onClick={onClose}>{t("common.cancel")}</button>
          <button className="rsm-btn-primary" disabled={!accepted || !name.trim()} onClick={() => onSign(name)} data-testid="modal-sign">
            <FileSignature size={14} className="inline mr-2" /> {t(`${k}.sign`)}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateModal({ op, onClose, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [r, setR] = useState({ technical: 5, communication: 5, deadlines: 5 });
  return (
    <div className="fixed inset-0 bg-[#0B132B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-2 border-[#0B132B] max-w-lg w-full p-8" onClick={(e) => e.stopPropagation()}>
        <div className="overline">Valoración del broker</div>
        <h3 className="font-display text-2xl font-semibold mt-1">Valora esta colaboración</h3>
        {["technical", "communication", "deadlines"].map((k) => (
          <div key={k} className="mt-5">
            <label className="rsm-label">{k}</label>
            <div className="flex gap-2 mt-2">
              {[1,2,3,4,5].map((n) => (
                <button key={n} onClick={() => setR({ ...r, [k]: n })} className={`w-9 h-9 border ${r[k] >= n ? "bg-[#0B132B] text-white border-[#0B132B]" : "bg-white border-[hsl(var(--border))] text-slate-400"}`}>
                  <Star size={14} className="inline" fill={r[k] >= n ? "#fff" : "none"} strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-6 flex justify-end gap-3">
          <button className="rsm-btn-outline" onClick={onClose}>{t("common.cancel")}</button>
          <button className="rsm-btn-primary" data-testid="submit-rating" onClick={async () => {
            try {
              await api.post("/ratings", { operation_id: op.id, broker_id: op.broker_user_id, ...r });
              onDone(); toast.success("Valoración enviada.");
            } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
          }}>{t("common.submit")}</button>
        </div>
      </div>
    </div>
  );
}
