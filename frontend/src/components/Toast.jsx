import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const add = useCallback((msg, type = "info") => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const toast = {
    success: (msg) => add(msg, "success"),
    error: (msg) => add(msg, "error"),
    info: (msg) => add(msg, "info"),
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none" style={{ minWidth: 320 }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast, onDismiss }) {
  const cfg = {
    success: { icon: <CheckCircle2 size={16} />, border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-900" },
    error:   { icon: <AlertCircle size={16} />,   border: "border-[#D32F2F]",   bg: "bg-red-50",     text: "text-red-900" },
    info:    { icon: <Info size={16} />,           border: "border-[#1565C0]",   bg: "bg-blue-50",    text: "text-blue-900" },
  }[toast.type] || {};

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 px-4 py-3 border-l-4 shadow-lg ${cfg.bg} ${cfg.border} ${cfg.text} max-w-sm w-full`}
      role="alert"
    >
      <span className="mt-0.5 shrink-0">{cfg.icon}</span>
      <span className="flex-1 text-sm font-medium">{toast.msg}</span>
      <button onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
