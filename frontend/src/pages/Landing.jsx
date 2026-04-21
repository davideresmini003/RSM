import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { DEMO_ACCOUNTS, quickLogin } from "../lib/demoAccess";
import { ShieldCheck, Fingerprint, FileClock, Lock, ArrowRight, Building2, Languages, Zap } from "lucide-react";

export default function Landing() {
  const { t, lang, setLang } = useI18n();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const enterAs = async (role) => {
    try {
      await quickLogin(role);
      await refresh();
      navigate(role === "admin" ? "/app/admin" : "/app");
    } catch (e) {
      alert("No se pudo iniciar sesión demo: " + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <div className="bg-white text-[#0B132B]" data-testid="landing-page">
      {/* Top nav */}
      <header className="border-b border-[hsl(var(--border))] bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="brand">
            <span className="font-display text-2xl font-bold tracking-tight">RSM</span>
            <span className="overline hidden sm:block">Reinsurance · Marketplace</span>
          </Link>
          <nav className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 text-xs border border-[hsl(var(--border))] px-2 py-1">
              <Languages size={14} strokeWidth={1.5} />
              <button onClick={() => setLang("es")} className={`overline ${lang === "es" ? "text-[#0B132B]" : "text-slate-400"}`} data-testid="top-lang-es">ES</button>
              <span className="text-slate-300">/</span>
              <button onClick={() => setLang("en")} className={`overline ${lang === "en" ? "text-[#0B132B]" : "text-slate-400"}`} data-testid="top-lang-en">EN</button>
            </div>
            <Link to="/login" className="text-sm font-semibold uppercase tracking-wider text-slate-600 hover:text-[#0B132B]" data-testid="nav-login">
              {t("common.login")}
            </Link>
            <button onClick={() => enterAs("admin")} className="rsm-btn-primary text-xs" data-testid="nav-admin">
              Admin
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative hero-gradient text-white overflow-hidden">
        <div className="grain absolute inset-0 opacity-40 pointer-events-none" />
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1774112168783-57b6b75a9353?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBldXJvcGVhbiUyMGFyY2hpdGVjdHVyZSUyMGZpbmFuY2lhbCUyMGRpc3RyaWN0fGVufDB8fHx8MTc3Njc1OTY4OHww&ixlib=rb-4.1.0&q=85')" }}
        />
        <div className="relative max-w-7xl mx-auto px-6 py-24 sm:py-32 grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-8">
            <div className="overline text-slate-300 mb-6">{t("landing.tagline")} · v1.0 · EU</div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-7xl font-semibold tracking-tighter leading-[1.05]" data-testid="hero-title">
              {t("landing.hero_title")}
            </h1>
            <p className="mt-8 text-lg sm:text-xl text-slate-300 max-w-2xl leading-relaxed">
              {t("landing.hero_sub")}
            </p>
            <div className="mt-10 inline-flex flex-col gap-4 p-6 bg-black/30 border border-slate-700 max-w-2xl">
              <div className="overline text-slate-400 flex items-center gap-2"><Zap size={12} strokeWidth={2} /> Demo · acceso directo sin registro</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-l border-t border-slate-700">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.role}
                    onClick={() => enterAs(a.role)}
                    className="border-r border-b border-slate-700 px-4 py-4 text-left hover:bg-[#D32F2F] transition-colors group"
                    data-testid={`enter-as-${a.role}`}
                  >
                    <div className="overline text-slate-400 group-hover:text-white transition-colors">Entrar como</div>
                    <div className="font-display text-lg font-semibold mt-1">{a.label}</div>
                    <div className="text-[10px] text-slate-500 group-hover:text-slate-200 mt-0.5 truncate">{a.company}</div>
                  </button>
                ))}
              </div>
              <Link to="/login" className="overline text-slate-400 hover:text-white flex items-center gap-2 transition-colors" data-testid="hero-cta-secondary">
                ¿Tienes una cuenta real? Iniciar sesión <ArrowRight size={12} strokeWidth={2} />
              </Link>
            </div>
          </div>
          <div className="lg:col-span-4 hidden lg:block">
            <div className="border border-slate-600 p-6 bg-black/20">
              <div className="overline text-slate-400">LIVE MARKETPLACE</div>
              <div className="mt-4 space-y-4">
                {[
                  { code: "RSM-2026-4721", branch: "Property", country: "España", lr: 62 },
                  { code: "RSM-2026-4814", branch: "Casualty", country: "Italia", lr: 71 },
                  { code: "RSM-2026-4903", branch: "Marine", country: "Francia", lr: 54 },
                ].map((r) => (
                  <div key={r.code} className="border border-slate-700 p-3 hover:border-white transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="font-mono-data text-sm font-semibold">{r.code}</div>
                      <Lock size={12} className="text-slate-500" strokeWidth={1.5} />
                    </div>
                    <div className="mt-2 text-xs text-slate-400">{r.branch} · {r.country}</div>
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-800 uppercase tracking-wider">LR {r.lr}%</span>
                      <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-800 uppercase tracking-wider">Verificado</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 sm:py-32 border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="overline text-center mb-4">Why RSM</div>
          <h2 className="font-display text-3xl sm:text-5xl font-semibold text-center max-w-3xl mx-auto tracking-tighter">
            Las tres columnas de un mercado reasegurador digital.
          </h2>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-0 border-l border-t border-[hsl(var(--border))]">
            {[
              { icon: Fingerprint, title: t("landing.feature_1_title"), desc: t("landing.feature_1_desc") },
              { icon: ShieldCheck, title: t("landing.feature_2_title"), desc: t("landing.feature_2_desc") },
              { icon: FileClock, title: t("landing.feature_3_title"), desc: t("landing.feature_3_desc") },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="border-r border-b border-[hsl(var(--border))] p-8" data-testid={`feature-${title}`}>
                <Icon size={28} strokeWidth={1.25} className="text-[#D32F2F]" />
                <h3 className="mt-6 font-display text-xl font-semibold tracking-tight">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 sm:py-32 border-b border-[hsl(var(--border))] bg-[#F8FAFC]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="overline mb-4">{t("landing.how_title")}</div>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mb-12">
            Del Submission Pack al contrato firmado, en la plataforma.
          </h2>
          <ol className="space-y-8">
            {[t("landing.step1"), t("landing.step2"), t("landing.step3"), t("landing.step4"), t("landing.step5")].map((step, i) => (
              <li key={i} className="flex gap-6 border-b border-[hsl(var(--border))] pb-6">
                <div className="font-mono-data text-4xl font-semibold text-[#D32F2F] leading-none w-16 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-lg pt-2">{step}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 sm:py-32 border-b border-[hsl(var(--border))]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="overline text-center mb-4">Pricing</div>
          <h2 className="font-display text-3xl sm:text-5xl font-semibold text-center tracking-tighter">{t("landing.pricing_title")}</h2>
          <p className="text-center text-slate-500 mt-4 max-w-2xl mx-auto">{t("landing.pricing_sub")}</p>
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-0 border-l border-t border-[hsl(var(--border))]">
            {[
              { role: "cedente", price: t("landing.price_cedente"), desc: t("landing.role_cedente_desc") },
              { role: "reasegurador", price: t("landing.price_reasegurador"), desc: t("landing.role_reasegurador_desc"), highlighted: true },
              { role: "broker", price: t("landing.price_broker"), desc: t("landing.role_broker_desc") },
            ].map((p) => (
              <div
                key={p.role}
                className={`border-r border-b border-[hsl(var(--border))] p-8 flex flex-col ${p.highlighted ? "bg-[#0B132B] text-white" : "bg-white"}`}
                data-testid={`pricing-${p.role}`}
              >
                <Building2 size={24} strokeWidth={1.25} className={p.highlighted ? "text-[#D32F2F]" : "text-[#0B132B]"} />
                <div className={`overline mt-6 ${p.highlighted ? "text-slate-400" : ""}`}>{t(`roles.${p.role}`)}</div>
                <div className="mt-4 flex items-baseline gap-2">
                  <div className="font-display text-5xl font-semibold tracking-tighter">{p.price}</div>
                  <div className={`text-sm ${p.highlighted ? "text-slate-400" : "text-slate-500"}`}>{t("landing.per_month")}</div>
                </div>
                <p className={`mt-6 text-sm leading-relaxed flex-1 ${p.highlighted ? "text-slate-300" : "text-slate-600"}`}>{p.desc}</p>
                <button
                  onClick={() => enterAs(p.role)}
                  className={`mt-8 text-center py-3 text-xs font-semibold uppercase tracking-wider ${p.highlighted ? "bg-[#D32F2F] text-white hover:bg-[#b71c1c]" : "bg-[#0B132B] text-white hover:bg-[#1a2447]"} transition-colors`}
                  data-testid={`pricing-cta-${p.role}`}
                >
                  Entrar como {p.role}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-12 bg-[#0B132B] text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <div className="font-display text-xl font-semibold text-white">RSM</div>
          <div className="overline">{t("landing.footer")}</div>
        </div>
      </footer>
    </div>
  );
}
