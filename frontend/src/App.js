import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/auth";
import { I18nProvider } from "./lib/i18n";
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
import Solicitudes from "./pages/Solicitudes";
import Mandates from "./pages/Mandates";
import Messages from "./pages/Messages";
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

function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-white">
      <RoleSidebar />
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}

// Stable role arrays so <Protected roles={...}> does not re-create refs every render
const ROLES_CEDENTE = ["cedente"];
const ROLES_BROKER = ["broker"];
const ROLES_ADMIN = ["admin"];

function App() {
  return (
    <I18nProvider>
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
            <Route path="/app/solicitudes" element={
              <Protected><NeedsOnboarding><AppLayout><Solicitudes /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/mandates" element={
              <Protected><NeedsOnboarding><AppLayout><Mandates /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/messages" element={
              <Protected><NeedsOnboarding><AppLayout><Messages /></AppLayout></NeedsOnboarding></Protected>
            } />
            <Route path="/app/admin" element={
              <Protected roles={ROLES_ADMIN}><AppLayout><Admin /></AppLayout></Protected>
            } />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}

export default App;
