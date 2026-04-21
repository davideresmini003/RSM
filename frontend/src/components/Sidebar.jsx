import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { DEMO_ACCOUNTS, quickLogin } from "../lib/demoAccess";
import { LayoutDashboard, Briefcase, MessageSquare, Users, Store, FileText, ClipboardList, ShieldCheck, UserCircle2, LogOut, Languages, RefreshCw } from "lucide-react";

export function RoleSidebar() {
  const { user, refresh } = useAuth();
  const { t, lang, setLang } = useI18n();
  const loc = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  if (!user) return null;
  const role = user.role;

  const switchRole = async (newRole) => {
    if (newRole === role) return;
    try {
      await quickLogin(newRole);
      await refresh();
      navigate(newRole === "admin" ? "/app/admin" : "/app");
    } catch (e) {
      console.warn("Role switch failed:", e.message);
    }
  };

  const base = [{ to: "/app", icon: LayoutDashboard, label: t("nav.dashboard"), exact: true }];
  if (role === "cedente") {
    base.push(
      { to: "/app/operations", icon: Briefcase, label: t("nav.operations") },
      { to: "/app/messages", icon: MessageSquare, label: t("nav.messages") },
      { to: "/app/brokers", icon: Store, label: t("nav.brokers") },
      { to: "/app/marketplace", icon: ClipboardList, label: t("nav.opportunities") },
    );
  } else if (role === "reasegurador") {
    base.push(
      { to: "/app/marketplace", icon: ClipboardList, label: t("nav.opportunities") },
      { to: "/app/operations", icon: Briefcase, label: t("nav.operations") },
      { to: "/app/messages", icon: MessageSquare, label: t("nav.messages") },
      { to: "/app/brokers", icon: Store, label: t("nav.brokers") },
    );
  } else if (role === "broker") {
    base.push(
      { to: "/app/solicitudes", icon: FileText, label: t("nav.solicitudes") },
      { to: "/app/mandates", icon: ClipboardList, label: t("nav.mandates") },
      { to: "/app/operations", icon: Briefcase, label: t("nav.operations") },
      { to: "/app/messages", icon: MessageSquare, label: t("nav.messages") },
      { to: "/app/broker-profile", icon: UserCircle2, label: t("nav.profile") },
      { to: "/app/marketplace", icon: ClipboardList, label: t("nav.opportunities") },
    );
  } else if (role === "admin") {
    base.push(
      { to: "/app/admin", icon: ShieldCheck, label: t("nav.admin") },
    );
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-[hsl(var(--border))] h-screen sticky top-0 flex flex-col" data-testid="sidebar">
      <div className="px-6 py-6 border-b border-[hsl(var(--border))]">
        <Link to="/app" className="block">
          <div className="font-display text-2xl font-bold text-[#0B132B]">RSM</div>
          <div className="overline mt-1">Reinsurance · Marketplace</div>
        </Link>
      </div>
      <nav className="flex-1 py-4">
        {base.map(({ to, icon: Icon, label, exact }) => {
          const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              data-testid={`nav-${label.toLowerCase().replace(/\s/g, "-")}`}
              className={`flex items-center gap-3 px-6 py-3 text-sm font-medium border-l-2 transition-colors ${
                active ? "border-[#0B132B] bg-slate-50 text-[#0B132B]" : "border-transparent text-slate-600 hover:text-[#0B132B] hover:bg-slate-50"
              }`}
            >
              <Icon size={16} strokeWidth={1.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[hsl(var(--border))] p-4 space-y-3">
        <div>
          <div className="overline flex items-center gap-1 mb-2"><RefreshCw size={10} strokeWidth={2} /> Cambiar rol · demo</div>
          <div className="grid grid-cols-2 gap-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.role}
                onClick={() => switchRole(a.role)}
                disabled={a.role === role}
                className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1.5 border transition-colors ${
                  a.role === role
                    ? "bg-[#0B132B] text-white border-[#0B132B] cursor-default"
                    : "bg-white text-slate-600 border-[hsl(var(--border))] hover:border-[#0B132B] hover:text-[#0B132B]"
                }`}
                data-testid={`switch-${a.role}`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Languages size={14} strokeWidth={1.5} />
          <button
            className={`overline ${lang === "es" ? "text-[#0B132B]" : "text-slate-400"}`}
            onClick={() => setLang("es")}
            data-testid="lang-es"
          >ES</button>
          <span className="text-slate-300">/</span>
          <button
            className={`overline ${lang === "en" ? "text-[#0B132B]" : "text-slate-400"}`}
            onClick={() => setLang("en")}
            data-testid="lang-en"
          >EN</button>
        </div>
        <div>
          <div className="text-sm font-medium text-[#0B132B] truncate">{user.name}</div>
          <div className="overline mt-1">{t(`roles.${user.role}`)}</div>
        </div>
        <button
          onClick={async () => { await logout(); navigate("/"); }}
          className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase text-slate-500 hover:text-[#D32F2F] transition-colors"
          data-testid="btn-logout"
        >
          <LogOut size={14} strokeWidth={1.5} /> {t("common.logout")}
        </button>
      </div>
    </aside>
  );
}
