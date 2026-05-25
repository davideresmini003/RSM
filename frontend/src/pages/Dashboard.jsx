import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { KPICard, SectionTitle, EmptyState, VerifiedBadge, AnonBadge, LossRatioPill, Tooltip } from "../components/ui-bits";
import { useToast } from "../components/Toast";
import { useConfirm } from "../lib/confirm";
import { Lock, ArrowRight, CircleDot } from "lucide-react";

export default function Dashboard() {
  const { user, company } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!user) return;
    setStats(null);
    api.get("/stats/dashboard").then(({ data }) => setStats(data));
  }, [user?.id]);

  if (!user) return null;
  const role = user.role;

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div className="mb-8">
        <div className="overline">{t("dashboard.welcome")}, {user.name}</div>
        <h1 className="font-display text-4xl font-semibold tracking-tight mt-1">
          {t(`roles.${role}`)} · Panel
        </h1>
        {company && !company.verified && (
          <div className="mt-4 border-l-4 border-[#FCD34D] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]" data-testid="pending-verification">
            Tu empresa está pendiente de verificación por el admin RSM. Podrás explorar pero algunas acciones estarán limitadas.
          </div>
        )}
      </div>

      {role === "cedente" && <CedenteDashboard stats={stats} userId={user.id} />}
      {role === "reasegurador" && <ReaseguradorDashboard stats={stats} nav={nav} userId={user.id} />}
      {role === "broker" && <BrokerDashboard stats={stats} userId={user.id} />}
      {role === "admin" && <AdminDashboard stats={stats} />}
    </div>
  );
}

function CedenteDashboard({ stats, userId }) {
  const { t } = useI18n();
  const toast = useToast();
  const { confirm, ConfirmPortal } = useConfirm();
  const [packs, setPacks] = useState([]);
  const [interests, setInterests] = useState([]);
  const [ops, setOps] = useState([]);
  const [pendingMandates, setPendingMandates] = useState([]);
  const [activeBrokers, setActiveBrokers] = useState([]);

  const load = useCallback(() => {
    api.get("/submission-packs/mine").then(({ data }) => setPacks(data.packs || []));
    api.get("/interests/received?status=pending").then(({ data }) => setInterests(data.items || []));
    api.get("/operations").then(({ data }) => setOps((data.operations || []).slice(0, 3)));
    api.get("/mandates").then(({ data }) => {
      const all = data.mandates || [];
      const pending = all.filter((m) => m.nca_signed_broker && !m.nca_signed_cedente);
      const active = all.filter((m) => m.nca_signed_broker && m.nca_signed_cedente);
      setPendingMandates(pending);
      setActiveBrokers(active);
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load, userId]);

  const publish = async (id) => {
    try { await api.put(`/submission-packs/${id}/status`, { status: "published" }); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const withdraw = async (id) => {
    const ok = await confirm({ title: "¿Retirar este pack?", message: "Dejará de ser visible en el marketplace. Podrás volver a publicarlo después.", confirmLabel: "Retirar" });
    if (!ok) return;
    try { await api.put(`/submission-packs/${id}/status`, { status: "withdrawn" }); load(); toast.success("Pack retirado del marketplace."); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const assignBroker = async (packId, brokerId) => {
    try { await api.put(`/submission-packs/${packId}/broker`, { broker_id: brokerId || null }); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };
  const respond = async (id, action) => {
    if (action === "reject") {
      const ok = await confirm({ title: "¿Rechazar este interés?", message: "El reasegurador no podrá acceder a este programa.", confirmLabel: "Rechazar" });
      if (!ok) return;
    }
    try { await api.post(`/interests/${id}/respond`, { action }); load(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || e.message); }
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-l border-t border-[hsl(var(--border))] mb-10">
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-published" label={t("dashboard.kpi.published")} value={stats?.published ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-interests" label={t("dashboard.kpi.interests_recv")} value={stats?.interests_pending ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-active-ops" label={t("dashboard.kpi.active_ops")} value={stats?.active_ops ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-nca-pending" accent label={t("dashboard.kpi.nca_pending")} value={stats?.nca_pending ?? 0} sub={stats?.mandate_nca_pending ? `${stats.mandate_nca_pending} con broker` : null} /></div>
      </div>

      <section className="mb-10">
        <SectionTitle actions={
          <Link to="/app/new-pack" className="rsm-btn-primary text-xs" data-testid="btn-new-pack">{t("dashboard.new_pack")}</Link>
        }>{t("dashboard.my_programs")}</SectionTitle>

        {packs.length === 0 ? (
          <EmptyState>
            <p>Publica tu primer Submission Pack y accede al mercado reasegurador europeo.</p>
            <Link to="/app/new-pack" className="rsm-btn-primary text-xs mt-4 inline-block" data-testid="cta-new-pack">+ Crear Submission Pack</Link>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packs.map((p) => (
              <div key={p.id} className="rsm-card rsm-card-hover" data-testid={`pack-${p.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono-data text-sm font-semibold">{p.code}</div>
                    <h3 className="font-display text-lg font-semibold mt-1">{p.title}</h3>
                  </div>
                  {p.status === "draft" && <span className="badge-anon">{t("pack.status.draft")}</span>}
                  {p.status === "published" && <VerifiedBadge>{t("pack.status.published")}</VerifiedBadge>}
                  {p.status === "withdrawn" && <span className="badge-pending">{t("pack.status.withdrawn")}</span>}
                </div>
                <div className="mt-3 text-xs text-slate-500 space-y-1">
                  <div>{p.branch} · {p.reinsurance_type}</div>
                  <div>{p.country_region || "—"} · Cesión {p.cession_pct}%</div>
                  <div>{p.interests_count ?? 0} {t("marketplace.interests")} · {p.interests_pending ?? 0} {t("pack.pending_review")}</div>
                </div>
                {activeBrokers.length > 0 && p.status !== "withdrawn" && (
                  <div className="mt-3 pt-3 border-t border-[hsl(var(--border))]">
                    <label className="rsm-label text-[10px]">Broker asignado</label>
                    <select
                      className="rsm-input mt-1 text-xs py-1"
                      value={p.broker_id || ""}
                      onChange={(e) => assignBroker(p.id, e.target.value || null)}
                      data-testid={`broker-select-${p.id}`}
                    >
                      <option value="">Sin broker</option>
                      {activeBrokers.map((m) => (
                        <option key={m.broker_id} value={m.broker_id}>{m.broker_name || m.broker_id}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  {p.status === "draft" && <button className="rsm-btn-primary text-xs" onClick={() => publish(p.id)} data-testid={`publish-${p.id}`}>{t("pack.action_publish")}</button>}
                  {p.status === "published" && <button className="rsm-btn-outline text-xs" onClick={() => withdraw(p.id)} data-testid={`withdraw-${p.id}`}>{t("pack.action_withdraw")}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <SectionTitle>{t("dashboard.recent_interests")}</SectionTitle>
        {interests.length === 0 ? <EmptyState>{t("dashboard.no_data")}</EmptyState> : (
          <div className="space-y-3">
            {interests.slice(0, 3).map((it) => (
              <div key={it.id} className="rsm-card flex items-center justify-between" data-testid={`interest-${it.id}`}>
                <div className="flex items-center gap-4">
                  <AnonBadge>{it.pack?.code || "—"}</AnonBadge>
                  <div>
                    <div className="text-sm font-medium">{it.pack?.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">🔒 Reasegurador anónimo — {it.message || "sin mensaje"}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="rsm-btn-primary text-xs" onClick={() => respond(it.id, "accept")} data-testid={`accept-${it.id}`}>{t("common.accept")}</button>
                  <button className="rsm-btn-danger" onClick={() => respond(it.id, "reject")} data-testid={`reject-${it.id}`}>{t("common.reject")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {ConfirmPortal}
      {pendingMandates.length > 0 && (
        <section className="mb-10">
          <SectionTitle actions={<Link to="/app/mandates" className="overline text-[#D32F2F]">Ver todos →</Link>}>
            🔔 NCA Pendiente con Broker
          </SectionTitle>
          <div className="space-y-3">
            {pendingMandates.map((m) => (
              <div key={m.id} className="rsm-card border-l-4 border-[#D32F2F] flex items-center justify-between" data-testid={`pending-mandate-${m.id}`}>
                <div>
                  <div className="text-sm font-semibold">El broker ha firmado el NCA — tu firma está pendiente</div>
                  <div className="text-xs text-slate-500 mt-1">Mandato creado el {new Date(m.created_at).toLocaleDateString()}</div>
                </div>
                <Link to="/app/mandates" className="rsm-btn-primary text-xs">Firmar NCA</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle actions={<Link to="/app/operations" className="overline text-[#0B132B] hover:text-[#D32F2F]">Ver todas →</Link>}>{t("dashboard.recent_ops")}</SectionTitle>
        {ops.length === 0 ? (
          <EmptyState>
            <p>Las operaciones aparecerán aquí cuando aceptes intereses de reaseguradores.</p>
          </EmptyState>
        ) : (
          <div className="space-y-2">
            {ops.map((op) => <OpRow key={op.id} op={op} role="cedente" />)}
          </div>
        )}
      </section>
    </>
  );
}

function ReaseguradorDashboard({ stats, nav, userId }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState([]);
  useEffect(() => {
    api.get("/marketplace/packs").then(({ data }) => setPacks((data.packs || []).slice(0, 3)));
  }, [userId]);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-l border-t border-[hsl(var(--border))] mb-10">
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.available")} value={stats?.available ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.interests_exp")} value={stats?.interests ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.active_ops")} value={stats?.active_ops ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.quotes_sent")} value={stats?.quotes_sent ?? 0} /></div>
      </div>

      <section>
        <SectionTitle actions={<Link to="/app/marketplace" className="overline text-[#0B132B] hover:text-[#D32F2F] flex items-center gap-1" data-testid="link-marketplace">{t("dashboard.ver_oportunidades")} <ArrowRight size={14} /></Link>}>{t("dashboard.nuevas_oportunidades")}</SectionTitle>
        {packs.length === 0 ? (
          <EmptyState>
            <p>Explora los programas de reaseguro publicados en el marketplace.</p>
            <Link to="/app/marketplace" className="rsm-btn-primary text-xs mt-4 inline-block" data-testid="cta-marketplace">Ver oportunidades →</Link>
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{packs.map((p) => <PackCard key={p.id} p={p} />)}</div>
        )}
      </section>
    </>
  );
}

function BrokerDashboard({ stats, userId }) {
  const { t } = useI18n();
  const [sols, setSols] = useState([]);
  const [assignedPacks, setAssignedPacks] = useState([]);
  useEffect(() => {
    api.get("/solicitudes/broker").then(({ data }) => setSols((data.items || []).filter((s) => s.status === "pending").slice(0, 3)));
    api.get("/broker/assigned-packs").then(({ data }) => setAssignedPacks(data.packs || [])).catch(() => {});
  }, [userId]);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-l border-t border-[hsl(var(--border))] mb-10">
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard accent label={t("dashboard.kpi.pending_sol")} value={stats?.pending_sol ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.active_mandates")} value={stats?.active_mandates ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.ops_active")} value={stats?.ops_active ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.rating_avg")} value={`${stats?.rating_avg ?? 0}/5`} /></div>
      </div>

      {assignedPacks.length > 0 && (
        <section className="mb-10">
          <SectionTitle actions={<Link to="/app/marketplace" className="overline text-[#0B132B]">Ver marketplace</Link>}>Mis programas gestionados</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignedPacks.map((p) => (
              <Link key={p.id} to={`/app/marketplace/${p.id}`} className="rsm-card rsm-card-hover block" data-testid={`broker-pack-${p.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono-data text-xs text-slate-500">{p.code}</div>
                    <h3 className="font-display text-base font-semibold mt-1">{p.title}</h3>
                    <div className="text-xs text-slate-500 mt-1">{p.cedente_name || "Cedente"} · {p.branch}</div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 border ${p.status === "published" ? "bg-emerald-50 text-emerald-800 border-emerald-300" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-400">{p.interests_count} interesados</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SectionTitle actions={<Link to="/app/solicitudes" className="overline text-[#0B132B]">Ver todas</Link>}>Solicitudes pendientes</SectionTitle>
      {sols.length === 0 ? (
        <EmptyState>
          <p>Completa tu perfil público para aparecer en el marketplace de brokers y recibir solicitudes.</p>
          <Link to="/app/broker-profile" className="rsm-btn-primary text-xs mt-4 inline-block" data-testid="cta-broker-profile">Editar mi perfil →</Link>
        </EmptyState>
      ) : (
        <div className="space-y-3">{sols.map((s) => (
          <div key={s.id} className="rsm-card flex justify-between items-start border-l-4 border-[#FCD34D]">
            <div>
              <span className="badge-anon uppercase">{s.requester_role === "cedente" ? "CEDENTE" : "REASEGURADOR"}</span>
              <div className="font-display text-lg font-semibold mt-2">{s.service}</div>
              <div className="text-xs text-slate-500 mt-1">{s.geographic_zone} · {s.volume_eur ? `€${Number(s.volume_eur).toLocaleString("es-ES")}` : "—"}</div>
              <div className="text-sm text-slate-600 mt-2">{s.message}</div>
            </div>
            <Link to="/app/solicitudes" className="rsm-btn-outline text-xs">{t("common.view")}</Link>
          </div>
        ))}</div>
      )}
    </>
  );
}

function AdminDashboard({ stats }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-l border-t border-[hsl(var(--border))]">
      <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.users")} value={stats?.users ?? 0} /></div>
      <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.companies")} value={stats?.companies ?? 0} /></div>
      <div className="border-r border-b border-[hsl(var(--border))]"><KPICard accent label={t("dashboard.kpi.pending_verif")} value={stats?.pending_verif ?? 0} /></div>
      <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.active_ops")} value={stats?.active_ops ?? 0} /></div>
    </div>
  );
}

function OpRow({ op, role }) {
  const { t } = useI18n();
  const counterName = role === "cedente"
    ? (op.revealed ? op.reasegurador_name : t("pack.anon_reas"))
    : (op.revealed ? op.cedente_name : t("pack.anon_ced"));
  return (
    <Link to={`/app/operations/${op.id}`} className="rsm-card rsm-card-hover flex items-center justify-between" data-testid={`op-row-${op.id}`}>
      <div>
        <div className="font-mono-data text-sm font-semibold">{op.code}</div>
        <div className="text-xs text-slate-500 mt-1">{counterName}</div>
      </div>
      <div className="overline">{t(`operation.states.${op.state}`) || op.state.replace("_", " ")}</div>
    </Link>
  );
}

export function PackCard({ p }) {
  const { t } = useI18n();
  return (
    <Link to={`/app/marketplace/${p.id}`} className="rsm-card rsm-card-hover block" data-testid={`pack-card-${p.id}`}>
      <div className="flex items-start justify-between">
        <div className="font-mono-data text-sm font-bold">{p.code}</div>
        <div className="flex gap-1 flex-wrap justify-end">
          {p.verified && <VerifiedBadge />}
          {p.broker_name && <span className="badge-anon">BROKER</span>}
        </div>
      </div>
      <h3 className="font-display text-lg font-semibold mt-3 line-clamp-2">{p.title}</h3>
      <div className="mt-3 pt-3 border-t border-[hsl(var(--border))] space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-slate-500">{t("pack.f_branch")}</span><span className="font-semibold">{p.branch}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">{t("pack.f_type")}</span><span className="font-semibold">{p.reinsurance_type}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">{t("pack.f_country")}</span><span className="font-semibold">{p.country_region || "—"}</span></div>
        <div className="flex justify-between items-center">
          <Tooltip content="Loss Ratio: siniestros pagados / primas devengadas × 100. &lt;65% bueno, 65-80% moderado, &gt;80% elevado.">
            <span className="text-slate-500 cursor-default">LR avg ⓘ</span>
          </Tooltip>
          <LossRatioPill value={p.avg_loss_ratio} />
        </div>
        <div className="flex justify-between"><span className="text-slate-500">Primas Y-1</span><span className="font-mono-data">€{Number(p.premiums_y1 || 0).toLocaleString("es-ES")}</span></div>
        <div className="flex justify-between">
          <Tooltip content="Porcentaje del riesgo original cedido al reasegurador.">
            <span className="text-slate-500 cursor-default">Cesión ⓘ</span>
          </Tooltip>
          <span className="font-mono-data">{p.cession_pct}%</span>
        </div>
      </div>
      <div className="mt-3 flex justify-between items-center text-[10px] uppercase tracking-wider text-slate-400">
        <span>{p.interests_count} {t("marketplace.interests")}</span>
        {p.own_interest && <span className="badge-pending">{p.own_interest}</span>}
      </div>
    </Link>
  );
}
