import React, { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { useNotifications } from "../lib/notifications";
import { LayoutDashboard, Briefcase, Store, FileText, ClipboardList, ShieldCheck, UserCircle2, LogOut, Languages } from "lucide-react";

function Badge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-[#D32F2F] text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function RoleSidebar({ open = false, onClose }) {
  const { user } = useAuth();
  const { t, lang, setLang } = useI18n();
  const loc = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const notif = useNotifications();

  useEffect(() => {
    onClose?.();
  }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;
  const role = user.role;

  // ops badge: pending NCA + unread chat messages
  const opsBadge = (notif.operations || 0) + (notif.chat || 0);
  // interests badge for cedente
  const interestsBadge = notif.interests || 0;

  const base = [{ to: "/app", icon: LayoutDashboard, label: t("nav.dashboard"), exact: true, badge: interestsBadge }];
  if (role === "cedente") {
    base.push(
      { to: "/app/operations", icon: Briefcase, label: t("nav.operations"), badge: opsBadge },
      { to: "/app/mandates", icon: FileText, label: t("nav.mandates") },
      { to: "/app/brokers", icon: Store, label: t("nav.brokers") },
      { to: "/app/marketplace", icon: ClipboardList, label: t("nav.opportunities") },
      { to: "/app/cedente-profile", icon: UserCircle2, label: t("nav.profile") },
    );
  } else if (role === "reasegurador") {
    base.push(
      { to: "/app/marketplace", icon: ClipboardList, label: t("nav.opportunities") },
      { to: "/app/operations", icon: Briefcase, label: t("nav.operations"), badge: opsBadge },
      { to: "/app/brokers", icon: Store, label: t("nav.brokers") },
      { to: "/app/reasegurador-profile", icon: UserCircle2, label: t("nav.profile") },
    );
  } else if (role === "broker") {
    base.push(
      { to: "/app/solicitudes", icon: FileText, label: t("nav.solicitudes"), badge: notif.solicitudes },
      { to: "/app/mandates", icon: ClipboardList, label: t("nav.mandates") },
      { to: "/app/operations", icon: Briefcase, label: t("nav.operations"), badge: opsBadge },
      { to: "/app/broker-profile", icon: UserCircle2, label: t("nav.profile") },
      { to: "/app/marketplace", icon: ClipboardList, label: t("nav.opportunities") },
    );
  } else if (role === "admin") {
    base.push(
      { to: "/app/admin", icon: ShieldCheck, label: t("nav.admin") },
    );
  }

  return (
    <aside
      className={`fixed md:sticky top-0 z-50 md:z-auto w-64 shrink-0 bg-white border-r border-[hsl(var(--border))] h-screen flex flex-col transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      data-testid="sidebar"
    >
      <div className="px-6 py-6 border-b border-[hsl(var(--border))]">
        <Link to="/app" className="block">
          <div className="font-display text-2xl font-bold text-[#0B132B]">RSM</div>
          <div className="overline mt-1">Reinsurance · Marketplace</div>
        </Link>
      </div>
      <nav className="flex-1 py-4">
        {base.map(({ to, icon: Icon, label, exact, badge }) => {
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
              <Badge count={badge} />
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[hsl(var(--border))] p-4 space-y-3">
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
