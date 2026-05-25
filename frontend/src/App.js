import React, { useState, useRef, useEffect, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/auth";
import { api } from "./lib/api";
import { I18nProvider } from "./lib/i18n";
import { ToastProvider } from "./components/Toast";
import { NotificationsProvider } from "./lib/notifications";
import { RoleSidebar } from "./components/Sidebar";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import NewPack from "./pages/NewPack";
import Marketplace from "./pages/Marketplace";
import SubmissionPackDetail from "./pages/SubmissionPackDetail";
import OperationsList from "./pages/OperationsList";
import OperationDetail from "./pages/OperationDetail";
import BrokersMarketplace from "./pages/BrokersMarketplace";
import BrokerPublicProfile from "./pages/BrokerPublicProfile";
import BrokerProfileEditor from "./pages/BrokerProfileEditor";
import CedenteProfileEditor from "./pages/CedenteProfileEditor";
import ReaseguradorProfileEditor from "./pages/ReaseguradorProfileEditor";
import Solicitudes from "./pages/Solicitudes";
import Mandates from "./pages/Mandates";
import Admin from "./pages/Admin";

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return children;
}

function NeedsOnboarding({ children }) {
  const { user, company, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin" && !user.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return children;
}

function SupportChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const listRef = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get("/support/messages");
      setMsgs(data.messages || []);
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    if (!open) return;
    load();
    const i = setInterval(load, 5000);
    return () => clearInterval(i);
  }, [open, load]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      const { data } = await api.post("/support/messages", { text });
      setMsgs((m) => [...m, data.message]);
      setText("");
    } catch (_) {}
  };

  if (!user || user.role === "admin") return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-20 right-6 z-50 w-14 h-14 rounded-full bg-[#0B132B] text-white shadow-lg flex items-center justify-center hover:bg-[#1a2540] transition-colors"
        title="Soporte RSM"
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        )}
      </button>

      {open && (
        <div className="fixed bottom-36 right-6 z-50 w-80 bg-white border-2 border-[#0B132B] shadow-2xl flex flex-col" style={{ height: 420 }}>
          <div className="bg-[#0B132B] text-white px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">RSM Soporte</div>
              <div className="text-xs opacity-70">Customer Service 24/7</div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Online" />
          </div>
          <div ref={listRef} className="flex-1 overflow-y-auto p-3 bg-[#F8FAFC] space-y-2">
            {msgs.length === 0 && (
              <div className="text-center text-slate-400 text-xs pt-8">
                Hola, ¿en qué podemos ayudarte?
              </div>
            )}
            {msgs.map((m) => {
              const mine = m.sender_role !== "admin";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] px-3 py-2 text-sm ${mine ? "bg-[#0B132B] text-white" : "bg-white border border-slate-200 text-slate-800"}`}>
                    {!mine && <div className="text-[10px] font-semibold text-slate-500 mb-1">RSM Support</div>}
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-200 p-2 flex gap-2">
            <input
              className="flex-1 border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0B132B]"
              placeholder="Escribe tu mensaje…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              onClick={send}
              className="px-3 py-2 bg-[#0B132B] text-white text-sm hover:bg-[#1a2540] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = React.useCallback(() => setSidebarOpen(false), []);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") closeSidebar(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeSidebar]);
  return (
    <NotificationsProvider>
      <div className="flex min-h-screen bg-white">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={closeSidebar} />
        )}
        <RoleSidebar open={sidebarOpen} onClose={closeSidebar} />
        <main className="flex-1 min-w-0">
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--border))] bg-white sticky top-0 z-30">
            <button onClick={() => setSidebarOpen(true)} className="text-[#0B132B] p-1" aria-label="Abrir menú">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <span className="font-display text-lg font-bold text-[#0B132B]">RSM</span>
          </div>
          {children}
        </main>
        <SupportChat />
      </div>
    </NotificationsProvider>
  );
}

// Stable role arrays so <Protected roles={...}> does not re-create refs every render
const ROLES_CEDENTE = ["cedente"];
const ROLES_BROKER = ["broker"];
const ROLES_REASEGURADOR = ["reasegurador"];
const ROLES_ADMIN = ["admin"];

function App() {
  return (
    <I18nProvider>
      <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/onboarding" element={
              <Protected><Onboarding /></Protected>
            } />

            <Route path="/app" element={
              <Protected><NeedsOnboarding><AppLayout><Dashboard /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/new-pack" element={
              <Protected roles={ROLES_CEDENTE}><NeedsOnboarding><AppLayout><NewPack /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/marketplace" element={
              <Protected><NeedsOnboarding><AppLayout><Marketplace /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/marketplace/:id" element={
              <Protected><NeedsOnboarding><AppLayout><SubmissionPackDetail /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/operations" element={
              <Protected><NeedsOnboarding><AppLayout><OperationsList /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/operations/:id" element={
              <Protected><NeedsOnboarding><AppLayout><OperationDetail /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/brokers" element={
              <Protected><NeedsOnboarding><AppLayout><BrokersMarketplace /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/brokers/:id" element={
              <Protected><NeedsOnboarding><AppLayout><BrokerPublicProfile /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/broker-profile" element={
              <Protected roles={ROLES_BROKER}><NeedsOnboarding><AppLayout><BrokerProfileEditor /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/cedente-profile" element={
              <Protected roles={ROLES_CEDENTE}><NeedsOnboarding><AppLayout><CedenteProfileEditor /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/reasegurador-profile" element={
              <Protected roles={ROLES_REASEGURADOR}><NeedsOnboarding><AppLayout><ReaseguradorProfileEditor /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/solicitudes" element={
              <Protected><NeedsOnboarding><AppLayout><Solicitudes /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/mandates" element={
              <Protected><NeedsOnboarding><AppLayout><Mandates /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/admin" element={
              <Protected roles={ROLES_ADMIN}><AppLayout><Admin /></AppLayout></Protected>
            } />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

export default App;
