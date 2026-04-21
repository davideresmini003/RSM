import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Timeline } from "../components/Timeline";
import { VerifiedBadge, AnonBadge } from "../components/ui-bits";
import { Lock, FileSignature, Send, Star } from "lucide-react";

export default function OperationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [op, setOp] = useState(null);
  const [tab, setTab] = useState("overview");
  const [ncaModal, setNcaModal] = useState(false);
  const [contractModal, setContractModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(
    () => api.get(`/operations/${id}`).then(({ data }) => setOp(data.operation)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  if (!op) return <div className="p-8">{t("common.loading")}</div>;

  const isCedente = op.cedente_user_id === user.id;
  const isRea = op.reasegurador_user_id === user.id;
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

      {/* Tabs */}
      <div className="mt-8 flex border-b border-[hsl(var(--border))]">
        {["overview", "nca", "quote", "chat", "documents"].map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-6 py-3 text-xs uppercase tracking-wider font-semibold transition-colors ${tab === k ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500 hover:text-[#0B132B]"}`}
            data-testid={`tab-${k}`}
          >
            {k === "overview" && t("operation.overview")}
            {k === "nca" && "NCA"}
            {k === "quote" && t("operation.quote_section")}
            {k === "chat" && t("operation.chat_section")}
            {k === "documents" && t("operation.documents_section")}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <Overview op={op} />}
        {tab === "nca" && <NcaSection op={op} needsMySign={needsMySign} bothSigned={bothSigned} onSign={() => setNcaModal(true)} />}
        {tab === "quote" && <QuoteSection op={op} user={user} reload={load} />}
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

      {op.quote && !op.quote.accepted && isCedente && bothSigned && (
        <div className="mt-6 border border-[hsl(var(--border))] bg-[#F8FAFC] p-6">
          <div className="overline">Acción requerida</div>
          <p className="text-sm mt-2 mb-4">El reasegurador ha enviado una cotización. Revísala en la pestaña Cotización y acéptala para generar el contrato.</p>
          <button className="rsm-btn-primary" onClick={async () => { await api.post(`/operations/${id}/accept-quote`); load(); }} data-testid="accept-quote">{t("operation.accept_quote")}</button>
        </div>
      )}

      {op.contract && !(op.contract.signed_cedente && op.contract.signed_reasegurador) && (isCedente || isRea) && (
        <div className="mt-6 border border-[hsl(var(--border))] bg-[#F8FAFC] p-6">
          <div className="overline">Contrato pendiente</div>
          <p className="text-sm mt-2 mb-4">
            Firmas: cedente {op.contract.signed_cedente ? "✓" : "—"} · reasegurador {op.contract.signed_reasegurador ? "✓" : "—"}
          </p>
          {((isCedente && !op.contract.signed_cedente) || (isRea && !op.contract.signed_reasegurador)) && (
            <button className="rsm-btn-primary" onClick={() => setContractModal(true)} data-testid="btn-sign-contract">{t("operation.sign_contract")}</button>
          )}
        </div>
      )}

      {ncaModal && <SignModal title={t("nca_modal.title")} onClose={() => setNcaModal(false)} onSign={async (name) => {
        try { await api.post(`/operations/${id}/sign-nca`, { operation_id: id, signer_name: name, accepted: true }); setNcaModal(false); load(); }
        catch (e) { alert(formatApiError(e.response?.data?.detail)); }
      }} />}
      {contractModal && <SignModal title="Firma del contrato" onClose={() => setContractModal(false)} onSign={async (name) => {
        try { await api.post(`/operations/${id}/sign-contract`, { operation_id: id, signer_name: name, accepted: true }); setContractModal(false); load(); }
        catch (e) { alert(formatApiError(e.response?.data?.detail)); }
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
  return (
    <div className="rsm-card">
      <div className="overline">{t("operation.nca_section")}</div>
      <h3 className="font-display text-xl font-semibold mt-2">Estado</h3>
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
  const isRea = op.reasegurador_user_id === user.id;
  const both = op.nca_signed_cedente && op.nca_signed_reasegurador;
  const [form, setForm] = useState({
    reinsurance_type: op.pack?.reinsurance_type || "",
    offered_share_pct: 30, ceding_commission_pct: 28, rate_on_line_pct: 0,
    attachment_point: 0, limit_eur: 0, estimated_premium_eur: 0, profit_commission_pct: 0,
    sliding_scale: false, sliding_min: 0, sliding_max: 0,
    exclusions: "", special_conditions: "", expiry_date: "",
  });
  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (!both) return <div className="rsm-card text-sm text-slate-500">{t("operation.chat_locked")}</div>;

  if (op.quote) {
    const q = op.quote;
    return (
      <div className="rsm-card">
        <div className="overline">Cotización {q.accepted ? "aceptada" : "recibida"}</div>
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
      </div>
    );
  }

  if (isRea) {
    return (
      <div className="rsm-card">
        <div className="overline">{t("quote.title")}</div>
        <div className="mt-3 border-l-4 border-[#FCD34D] bg-[#FFFBEB] p-3 text-xs">{t("quote.warning_once")}</div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div><label className="rsm-label">Tipo</label><input className="rsm-input" value={form.reinsurance_type} onChange={(e) => upd("reinsurance_type", e.target.value)} /></div>
          <div><label className="rsm-label">{t("quote.offered_share")}</label><input type="number" className="rsm-input" value={form.offered_share_pct} onChange={(e) => upd("offered_share_pct", Number(e.target.value))} data-testid="quote-share" /></div>
          <div><label className="rsm-label">{t("quote.ceding_commission")}</label><input type="number" className="rsm-input" value={form.ceding_commission_pct} onChange={(e) => upd("ceding_commission_pct", Number(e.target.value))} /></div>
          <div><label className="rsm-label">{t("quote.rate_on_line")}</label><input type="number" className="rsm-input" value={form.rate_on_line_pct} onChange={(e) => upd("rate_on_line_pct", Number(e.target.value))} /></div>
          <div><label className="rsm-label">{t("quote.attachment_point")}</label><input type="number" className="rsm-input" value={form.attachment_point} onChange={(e) => upd("attachment_point", Number(e.target.value))} /></div>
          <div><label className="rsm-label">{t("quote.limit")}</label><input type="number" className="rsm-input" value={form.limit_eur} onChange={(e) => upd("limit_eur", Number(e.target.value))} /></div>
          <div><label className="rsm-label">{t("quote.estimated_premium")}</label><input type="number" className="rsm-input" value={form.estimated_premium_eur} onChange={(e) => upd("estimated_premium_eur", Number(e.target.value))} /></div>
          <div><label className="rsm-label">{t("quote.profit_commission")}</label><input type="number" className="rsm-input" value={form.profit_commission_pct} onChange={(e) => upd("profit_commission_pct", Number(e.target.value))} /></div>
          <div><label className="rsm-label">{t("quote.expiry_date")}</label><input type="date" className="rsm-input" value={form.expiry_date} onChange={(e) => upd("expiry_date", e.target.value)} /></div>
        </div>
        <div className="mt-4"><label className="rsm-label">{t("quote.exclusions")}</label><textarea className="rsm-input" rows={3} value={form.exclusions} onChange={(e) => upd("exclusions", e.target.value)} /></div>
        <div className="mt-4"><label className="rsm-label">{t("quote.special_conditions")}</label><textarea className="rsm-input" rows={3} value={form.special_conditions} onChange={(e) => upd("special_conditions", e.target.value)} /></div>
        <button className="rsm-btn-primary mt-6" data-testid="btn-submit-quote" onClick={async () => {
          try { await api.post(`/operations/${op.id}/quote`, { operation_id: op.id, ...form }); reload(); }
          catch (e) { alert(formatApiError(e.response?.data?.detail)); }
        }}>{t("operation.submit_quote")}</button>
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

function ChatSection({ op, user }) {
  const { t } = useI18n();
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
  const [text, setText] = useState("");
  const [locked, setLocked] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/messages/${op.id}`, { params: { channel } });
      setMsgs(data.messages || []);
      setLocked(data.locked);
    } catch (e) {
      console.warn("Message load failed:", e.message);
    }
  }, [op.id, channel]);
  useEffect(() => { load(); const i = setInterval(load, 4000); return () => clearInterval(i); }, [load]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [msgs]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await api.post("/messages", { operation_id: op.id, channel, text });
      setText(""); load();
    } catch (e) { alert(formatApiError(e.response?.data?.detail)); }
  };

  if (locked) return <div className="rsm-card text-sm text-slate-500">🔒 {t("operation.chat_locked")}</div>;

  return (
    <div className="rsm-card">
      {hasBroker && (
        <div className="flex border-b border-[hsl(var(--border))] mb-4">
          {isBroker || user.role === "cedente" ? (
            <button className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold ${channel === "broker-cedente" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} onClick={() => setChannel("broker-cedente")} data-testid="tab-broker-cedente">{t("operation.tab_with_cedente")}</button>
          ) : null}
          {isBroker || user.role === "reasegurador" ? (
            <button className={`px-4 py-2 text-xs uppercase tracking-wider font-semibold ${channel === "broker-reasegurador" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} onClick={() => setChannel("broker-reasegurador")} data-testid="tab-broker-reasegurador">{t("operation.tab_with_reasegurador")}</button>
          ) : null}
        </div>
      )}
      <div ref={listRef} className="h-96 overflow-y-auto border border-[hsl(var(--border))] p-4 bg-[#F8FAFC]" data-testid="chat-messages">
        {msgs.length === 0 && <div className="text-center text-slate-400 text-sm py-16">Sin mensajes.</div>}
        {msgs.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] ${mine ? "bg-[#0B132B] text-white" : "bg-white border border-[hsl(var(--border))]"} p-3`}>
                <div className="overline text-[10px] mb-1 opacity-70">{m.sender_name} · {m.sender_role}</div>
                <div className="text-sm">{m.text}</div>
                <div className="text-[10px] opacity-60 mt-1 font-mono-data">{new Date(m.created_at).toLocaleTimeString()}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <input className="rsm-input flex-1" placeholder="Escribe un mensaje…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} data-testid="chat-input" />
        <button className="rsm-btn-primary" onClick={send} data-testid="chat-send"><Send size={14} /></button>
      </div>
    </div>
  );
}

function DocumentsSection({ op, bothSigned }) {
  const docs = [
    "SFCR", "Histórico primas (3 años)", "Histórico siniestros",
    "Grandes siniestros", "Exposición geográfica", "Estructura reaseguro actual",
  ];
  return (
    <div className="rsm-card">
      <div className="overline">Documentos post-NCA</div>
      <div className="mt-4 space-y-2">
        {docs.map((d) => (
          <div key={d} className="flex items-center justify-between border border-[hsl(var(--border))] p-3 text-sm">
            <div className="flex items-center gap-2">
              {!bothSigned && <Lock size={12} className="text-slate-400" strokeWidth={1.5} />}
              <span className={!bothSigned ? "text-slate-400" : ""}>{d}</span>
            </div>
            {bothSigned ? (
              <span className="overline text-emerald-700">Disponible</span>
            ) : (
              <span className="overline text-slate-400">Bloqueado</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SignModal({ title, onClose, onSign }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  return (
    <div className="fixed inset-0 bg-[#0B132B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white border-2 border-[#0B132B] max-w-2xl w-full p-8" style={{ boxShadow: "8px 8px 0 #0B132B" }} onClick={(e) => e.stopPropagation()}>
        <div className="overline text-[#D32F2F]">Documento legal · eIDAS</div>
        <h2 className="font-display text-2xl font-semibold mt-1">{title}</h2>
        <div className="mt-4 text-xs text-slate-600 space-y-2 max-h-48 overflow-y-auto border border-[hsl(var(--border))] p-4 bg-[#F8FAFC]">
          <p>{t("nca_modal.intro")}</p>
          <p>{t("nca_modal.terms_1")}</p>
          <p>{t("nca_modal.terms_2")}</p>
          <p>{t("nca_modal.terms_3")}</p>
          <p>{t("nca_modal.terms_4")}</p>
        </div>
        <label className="flex items-start gap-3 text-sm mt-4">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} data-testid="modal-accept" />
          <span>{t("nca_modal.accept")}</span>
        </label>
        <div className="mt-4"><label className="rsm-label">{t("nca_modal.signer_name")}</label><input className="rsm-input" value={name} onChange={(e) => setName(e.target.value)} data-testid="modal-signer" /></div>
        <div className="mt-2 text-xs text-slate-500 font-mono-data">{t("nca_modal.timestamp")}: {new Date().toISOString()}</div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="rsm-btn-outline" onClick={onClose}>{t("common.cancel")}</button>
          <button className="rsm-btn-primary" disabled={!accepted || !name.trim()} onClick={() => onSign(name)} data-testid="modal-sign">
            <FileSignature size={14} className="inline mr-2" /> {t("nca_modal.sign")}
          </button>
        </div>
      </div>
    </div>
  );
}

function RateModal({ op, onClose, onDone }) {
  const { t } = useI18n();
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
              onDone();
            } catch (e) { alert(formatApiError(e.response?.data?.detail)); }
          }}>{t("common.submit")}</button>
        </div>
      </div>
    </div>
  );
}
