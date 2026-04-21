import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { KPICard, SectionTitle, EmptyState, VerifiedBadge, AnonBadge, LossRatioPill } from "../components/ui-bits";
import { Lock, ArrowRight, CircleDot } from "lucide-react";

export default function Dashboard() {
  const { user, company } = useAuth();
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/stats/dashboard").then(({ data }) => setStats(data));
  }, []);

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

      {role === "cedente" && <CedenteDashboard stats={stats} />}
      {role === "reasegurador" && <ReaseguradorDashboard stats={stats} nav={nav} />}
      {role === "broker" && <BrokerDashboard stats={stats} />}
      {role === "admin" && <AdminDashboard stats={stats} />}
    </div>
  );
}

function CedenteDashboard({ stats }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState([]);
  const [interests, setInterests] = useState([]);
  const [ops, setOps] = useState([]);

  const load = () => {
    api.get("/submission-packs/mine").then(({ data }) => setPacks(data.packs || []));
    api.get("/interests/received?status=pending").then(({ data }) => setInterests(data.items || []));
    api.get("/operations").then(({ data }) => setOps((data.operations || []).slice(0, 3)));
  };
  useEffect(() => { load(); }, []);

  const publish = async (id) => {
    try { await api.put(`/submission-packs/${id}/status`, { status: "published" }); load(); } catch (e) { alert(e.response?.data?.detail || e.message); }
  };
  const withdraw = async (id) => {
    await api.put(`/submission-packs/${id}/status`, { status: "withdrawn" }); load();
  };
  const respond = async (id, action) => {
    await api.post(`/interests/${id}/respond`, { action }); load();
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-l border-t border-[hsl(var(--border))] mb-10">
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-published" label={t("dashboard.kpi.published")} value={stats?.published ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-interests" label={t("dashboard.kpi.interests_recv")} value={stats?.interests_pending ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-active-ops" label={t("dashboard.kpi.active_ops")} value={stats?.active_ops ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard testid="kpi-nca-pending" accent label={t("dashboard.kpi.nca_pending")} value={stats?.nca_pending ?? 0} /></div>
      </div>

      <section className="mb-10">
        <SectionTitle actions={
          <Link to="/app/new-pack" className="rsm-btn-primary text-xs" data-testid="btn-new-pack">{t("dashboard.new_pack")}</Link>
        }>{t("dashboard.my_programs")}</SectionTitle>

        {packs.length === 0 ? <EmptyState>{t("dashboard.no_data")}</EmptyState> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {packs.map((p) => (
              <div key={p.id} className="rsm-card rsm-card-hover" data-testid={`pack-${p.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono-data text-sm font-semibold">{p.code}</div>
                    <h3 className="font-display text-lg font-semibold mt-1">{p.title}</h3>
                  </div>
                  {p.status === "draft" && <span className="badge-anon">DRAFT</span>}
                  {p.status === "published" && <VerifiedBadge>PUBLICADO</VerifiedBadge>}
                  {p.status === "withdrawn" && <span className="badge-pending">RETIRADO</span>}
                </div>
                <div className="mt-3 text-xs text-slate-500 space-y-1">
                  <div>{p.branch} · {p.reinsurance_type}</div>
                  <div>{p.country_region || "—"} · Cesión {p.cession_pct}%</div>
                  <div>{p.interests_count} interesados · {p.interests_pending} pendientes</div>
                </div>
                <div className="mt-4 flex gap-2">
                  {p.status === "draft" && <button className="rsm-btn-primary text-xs" onClick={() => publish(p.id)} data-testid={`publish-${p.id}`}>Publicar</button>}
                  {p.status === "published" && <button className="rsm-btn-outline text-xs" onClick={() => withdraw(p.id)}>Retirar</button>}
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

      <section>
        <SectionTitle>{t("dashboard.recent_ops")}</SectionTitle>
        {ops.length === 0 ? <EmptyState>{t("dashboard.no_data")}</EmptyState> : (
          <div className="space-y-2">
            {ops.map((op) => <OpRow key={op.id} op={op} role="cedente" />)}
          </div>
        )}
      </section>
    </>
  );
}

function ReaseguradorDashboard({ stats, nav }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState([]);
  useEffect(() => {
    api.get("/marketplace/packs").then(({ data }) => setPacks(data.packs.slice(0, 3)));
  }, []);
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
        {packs.length === 0 ? <EmptyState>Sin oportunidades todavía.</EmptyState> : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{packs.map((p) => <PackCard key={p.id} p={p} />)}</div>
        )}
      </section>
    </>
  );
}

function BrokerDashboard({ stats }) {
  const { t } = useI18n();
  const [sols, setSols] = useState([]);
  useEffect(() => {
    api.get("/solicitudes/broker").then(({ data }) => setSols((data.items || []).filter((s) => s.status === "pending").slice(0, 3)));
  }, []);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-l border-t border-[hsl(var(--border))] mb-10">
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard accent label={t("dashboard.kpi.pending_sol")} value={stats?.pending_sol ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.active_mandates")} value={stats?.active_mandates ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.ops_active")} value={stats?.ops_active ?? 0} /></div>
        <div className="border-r border-b border-[hsl(var(--border))]"><KPICard label={t("dashboard.kpi.rating_avg")} value={`${stats?.rating_avg ?? 0}/5`} /></div>
      </div>
      <SectionTitle actions={<Link to="/app/solicitudes" className="overline text-[#0B132B]">Ver todas</Link>}>Solicitudes pendientes</SectionTitle>
      {sols.length === 0 ? <EmptyState>{t("broker.no_sol")}</EmptyState> : (
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
  const counterName = role === "cedente"
    ? (op.revealed ? op.reasegurador_name : "🔒 Reasegurador anónimo")
    : (op.revealed ? op.cedente_name : "🔒 Cedente anónimo");
  return (
    <Link to={`/app/operations/${op.id}`} className="rsm-card rsm-card-hover flex items-center justify-between" data-testid={`op-row-${op.id}`}>
      <div>
        <div className="font-mono-data text-sm font-semibold">{op.code}</div>
        <div className="text-xs text-slate-500 mt-1">{counterName}</div>
      </div>
      <div className="overline">{op.state.replace("_", " ")}</div>
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
        <div className="flex justify-between items-center"><span className="text-slate-500">LR avg</span><LossRatioPill value={p.avg_loss_ratio} /></div>
        <div className="flex justify-between"><span className="text-slate-500">Primas Y-1</span><span className="font-mono-data">€{Number(p.premiums_y1 || 0).toLocaleString("es-ES")}</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Cesión</span><span className="font-mono-data">{p.cession_pct}%</span></div>
      </div>
      <div className="mt-3 flex justify-between items-center text-[10px] uppercase tracking-wider text-slate-400">
        <span>{p.interests_count} {t("marketplace.interests")}</span>
        {p.own_interest && <span className="badge-pending">{p.own_interest}</span>}
      </div>
    </Link>
  );
}
