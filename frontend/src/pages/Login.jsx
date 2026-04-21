import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const r = await login(email, password);
    setLoading(false);
    if (r.ok) nav("/app");
    else setErr(r.error);
  };

  const demo = async (email) => {
    setEmail(email); setPassword("Demo123!");
    setLoading(true); setErr("");
    const r = await login(email, "Demo123!");
    setLoading(false);
    if (r.ok) nav("/app");
    else setErr(r.error);
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2" data-testid="login-page">
      <div className="hidden lg:block hero-gradient relative overflow-hidden">
        <div className="grain absolute inset-0 opacity-40" />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <Link to="/" className="font-display text-3xl font-bold">RSM</Link>
          <div>
            <div className="overline text-slate-300 mb-4">Secure access</div>
            <div className="font-display text-3xl font-semibold max-w-md leading-tight">
              Un único punto de acceso a toda tu actividad en el mercado reasegurador europeo.
            </div>
            <div className="mt-8 text-xs text-slate-400 overline">eIDAS · RGPD · Audit log inmutable</div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8"><Link to="/" className="font-display text-2xl font-bold">RSM</Link></div>
          <div className="overline mb-2">Sign in</div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-[#0B132B]">{t("common.login")}</h1>
          <form onSubmit={submit} className="mt-10 space-y-5">
            <div>
              <label className="rsm-label">{t("common.email")}</label>
              <input className="rsm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="login-email" />
            </div>
            <div>
              <label className="rsm-label">{t("common.password")}</label>
              <input className="rsm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
            </div>
            {err && <div className="text-xs text-[#D32F2F] border border-[#D32F2F] bg-red-50 p-3" data-testid="login-error">{err}</div>}
            <button className="rsm-btn-primary w-full" disabled={loading} data-testid="login-submit">
              {loading ? t("common.loading") : t("common.login")}
            </button>
          </form>

          <div className="mt-8">
            <div className="overline mb-3 text-center">Demo accounts</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Cedente", email: "cedente@demo.eu" },
                { label: "Reasegur.", email: "reasegurador@demo.eu" },
                { label: "Broker", email: "broker@demo.eu" },
              ].map((d) => (
                <button
                  key={d.email}
                  onClick={() => demo(d.email)}
                  className="border border-[hsl(var(--border))] px-3 py-2 text-[10px] uppercase tracking-wider font-semibold hover:bg-slate-50"
                  data-testid={`demo-${d.label.toLowerCase()}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">Admin: admin@rsm.eu / Admin123!</p>
          </div>

          <p className="mt-8 text-sm text-slate-600">
            ¿Sin cuenta? <Link to="/register" className="font-semibold text-[#0B132B] hover:underline" data-testid="link-register">{t("common.register")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
