import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";

export default function Messages() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [ops, setOps] = useState([]);
  useEffect(() => { api.get("/operations").then(({ data }) => setOps(data.operations || [])); }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto" data-testid="messages-page">
      <div className="overline">Mensajes</div>
      <h1 className="font-display text-3xl font-semibold tracking-tight mt-1 mb-8">Conversaciones</h1>
      <p className="text-sm text-slate-600 mb-6">Abre una operación para acceder a su chat. Los chats se desbloquean tras la firma del NCA.</p>
      <div className="border border-[hsl(var(--border))] bg-white">
        {ops.length === 0 && <div className="p-8 text-center text-slate-400">Sin operaciones.</div>}
        {ops.map((op) => {
          const counter = counterpartyLabel(op, user.role);
          return (
            <Link key={op.id} to={`/app/operations/${op.id}`} className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))] last:border-b-0 hover:bg-[#F8FAFC] transition-colors">
              <div>
                <div className="font-mono-data font-semibold text-sm">{op.code}</div>
                <div className="text-xs text-slate-500 mt-1">{counter}</div>
              </div>
              <div className="overline">{op.state.replace("_", " ")} →</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function counterpartyLabel(op, role) {
  if (role === "cedente") {
    return op.revealed ? op.reasegurador_name : "🔒 Reasegurador anónimo";
  }
  if (role === "reasegurador") {
    return op.revealed ? op.cedente_name : "🔒 Cedente anónimo";
  }
  // broker / admin
  if (op.revealed) return `${op.cedente_name} · ${op.reasegurador_name}`;
  return "🔒 Partes anónimas";
}
