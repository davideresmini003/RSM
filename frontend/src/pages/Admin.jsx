import React, { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { VerifiedBadge, PendingBadge } from "../components/ui-bits";

export default function Admin() {
  const { t } = useI18n();
  const [tab, setTab] = useState("companies");
  const [companies, setCompanies] = useState([]);
  const [audit, setAudit] = useState([]);

  const load = () => {
    api.get("/admin/companies").then(({ data }) => setCompanies(data.companies || []));
    api.get("/admin/audit").then(({ data }) => setAudit(data.items || []));
  };
  useEffect(() => { load(); }, []);

  const verify = async (company_id, verified) => {
    await api.post("/admin/companies/verify", { company_id, verified });
    load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="admin-page">
      <div className="overline">Admin</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">{t("admin.title")}</h1>

      <div className="flex border-b border-[hsl(var(--border))] mb-6">
        <button onClick={() => setTab("companies")} className={`px-6 py-3 text-xs uppercase tracking-wider font-semibold ${tab === "companies" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} data-testid="admin-tab-companies">{t("admin.companies")}</button>
        <button onClick={() => setTab("audit")} className={`px-6 py-3 text-xs uppercase tracking-wider font-semibold ${tab === "audit" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} data-testid="admin-tab-audit">{t("admin.audit_log")}</button>
        <button onClick={() => setTab("support")} className={`px-6 py-3 text-xs uppercase tracking-wider font-semibold ${tab === "support" ? "border-b-2 border-[#0B132B] text-[#0B132B]" : "text-slate-500"}`} data-testid="admin-tab-support">Soporte</button>
      </div>

      {tab === "companies" && (
        <div className="border border-[hsl(var(--border))] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="text-left px-4 py-3 overline">Empresa</th>
                <th className="text-left px-4 py-3 overline">Rol</th>
                <th className="text-left px-4 py-3 overline">NIF</th>
                <th className="text-left px-4 py-3 overline">País</th>
                <th className="text-left px-4 py-3 overline">Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-[hsl(var(--border))]" data-testid={`company-${c.id}`}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 overline">{c.role}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{c.tax_id}</td>
                  <td className="px-4 py-3 text-xs">{c.country}</td>
                  <td className="px-4 py-3">{c.verified ? <VerifiedBadge /> : <PendingBadge />}</td>
                  <td className="px-4 py-3 text-right">
                    {c.verified ? (
                      <button className="rsm-btn-danger" onClick={() => verify(c.id, false)} data-testid={`unverify-${c.id}`}>{t("admin.unverify")}</button>
                    ) : (
                      <button className="rsm-btn-primary text-xs" onClick={() => verify(c.id, true)} data-testid={`verify-${c.id}`}>{t("admin.verify")}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="border border-[hsl(var(--border))] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#F8FAFC] border-b border-[hsl(var(--border))]">
              <tr>
                <th className="text-left px-4 py-3 overline">Fecha</th>
                <th className="text-left px-4 py-3 overline">Acción</th>
                <th className="text-left px-4 py-3 overline">Usuario</th>
                <th className="text-left px-4 py-3 overline">Target</th>
                <th className="text-left px-4 py-3 overline">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-[hsl(var(--border))]">
                  <td className="px-4 py-3 font-mono-data text-xs">{new Date(a.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3 overline">{a.action}</td>
                  <td className="px-4 py-3 text-xs">{a.user_email} · {a.user_role}</td>
                  <td className="px-4 py-3 text-xs font-mono-data">{a.target_type}:{a.target_id?.slice(0, 8)}</td>
                  <td className="px-4 py-3 font-mono-data text-xs">{a.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "support" && <SupportPanel />}
    </div>
  );
}

function SupportPanel() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState("");
  const listRef = useRef(null);

  const load = useCallback(() => {
    api.get("/support/messages").then(({ data }) => {
      setConversations(data.conversations || []);
    });
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [selected, conversations]);

  const selectedConv = conversations.find((c) => c.user_id === selected);

  const reply = async () => {
    if (!text.trim() || !selected) return;
    try {
      await api.post("/support/messages", { text, user_id: selected });
      setText("");
      load();
    } catch (_) {}
  };

  return (
    <div className="flex border border-[hsl(var(--border))] bg-white" style={{ height: 600 }}>
      <div className="w-72 border-r border-[hsl(var(--border))] overflow-y-auto">
        <div className="px-4 py-3 overline border-b border-[hsl(var(--border))]">Conversaciones</div>
        {conversations.length === 0 && <div className="p-4 text-sm text-slate-400">Sin mensajes de soporte.</div>}
        {conversations.map((c) => (
          <button
            key={c.user_id}
            onClick={() => setSelected(c.user_id)}
            className={`w-full text-left px-4 py-3 border-b border-[hsl(var(--border))] hover:bg-slate-50 ${selected === c.user_id ? "bg-slate-100" : ""}`}
          >
            <div className="flex justify-between items-center">
              <div className="font-semibold text-sm truncate">{c.user_name}</div>
              {c.unread > 0 && <span className="text-xs bg-[#D32F2F] text-white px-1.5 py-0.5 rounded-full">{c.unread}</span>}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{c.user_role} · {c.user_email}</div>
            <div className="text-xs text-slate-400 mt-1 truncate">{c.messages[c.messages.length - 1]?.text}</div>
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        {!selectedConv ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Selecciona una conversación</div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[#F8FAFC]">
              <div className="font-semibold text-sm">{selectedConv.user_name}</div>
              <div className="text-xs text-slate-500">{selectedConv.user_email} · {selectedConv.user_role}</div>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-white">
              {selectedConv.messages.map((m) => {
                const isAdmin = m.sender_role === "admin";
                return (
                  <div key={m.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3 py-2 text-sm ${isAdmin ? "bg-[#0B132B] text-white" : "bg-[#F8FAFC] border border-slate-200"}`}>
                      {m.text}
                      <div className="text-[10px] opacity-60 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-[hsl(var(--border))] p-3 flex gap-2">
              <input
                className="flex-1 border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0B132B]"
                placeholder="Responder…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && reply()}
              />
              <button onClick={reply} className="px-4 py-2 bg-[#0B132B] text-white text-sm hover:bg-[#1a2540]">Enviar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
