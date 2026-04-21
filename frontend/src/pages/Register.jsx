import React, { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

export default function Register() {
  const { t } = useI18n();
  const { register } = useAuth();
  const [params] = useSearchParams();
  const [role, setRole] = useState(params.get("role") || "cedente");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    const r = await register({ email, password, name, role });
    setLoading(false);
    if (r.ok) nav("/onboarding");
    else setErr(r.error);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-[#F8FAFC]" data-testid="register-page">
      <div className="w-full max-w-xl bg-white border border-[hsl(var(--border))] p-10">
        <Link to="/" className="font-display text-2xl font-bold text-[#0B132B]">RSM</Link>
        <div className="overline mt-6 mb-2">New account</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Crear cuenta</h1>
        <p className="text-sm text-slate-500 mt-2">Selecciona tu rol. 30 días de prueba gratis.</p>

        <div className="mt-8 grid grid-cols-3 gap-0 border-l border-t border-[hsl(var(--border))]">
          {["cedente", "reasegurador", "broker"].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`border-r border-b border-[hsl(var(--border))] p-4 text-xs uppercase tracking-wider font-semibold transition-colors ${
                role === r ? "bg-[#0B132B] text-white" : "bg-white hover:bg-slate-50 text-slate-600"
              }`}
              data-testid={`role-${r}`}
            >
              {t(`roles.${r}`)}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label className="rsm-label">{t("common.name")}</label>
            <input className="rsm-input" value={name} onChange={(e) => setName(e.target.value)} required data-testid="reg-name" />
          </div>
          <div>
            <label className="rsm-label">{t("common.email")}</label>
            <input className="rsm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="reg-email" />
          </div>
          <div>
            <label className="rsm-label">{t("common.password")}</label>
            <input className="rsm-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="reg-password" />
          </div>
          {err && <div className="text-xs text-[#D32F2F] border border-[#D32F2F] bg-red-50 p-3" data-testid="reg-error">{err}</div>}
          <button className="rsm-btn-primary w-full" disabled={loading} data-testid="reg-submit">
            {loading ? t("common.loading") : t("common.register")}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-600">
          ¿Ya tienes cuenta? <Link to="/login" className="font-semibold text-[#0B132B] hover:underline">{t("common.login")}</Link>
        </p>
      </div>
    </div>
  );
}
