import React, { useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

function ConfirmDialog({ title, message, confirmLabel = "Confirmar", onResolve }) {
  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => onResolve(false)}>
      <div className="bg-white border-2 border-[#0B132B] max-w-md w-full p-6 shadow-xl" style={{ boxShadow: "6px 6px 0 #0B132B" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-[#D32F2F] shrink-0 mt-0.5" strokeWidth={1.5} />
          <div>
            <div className="font-display text-lg font-semibold">{title}</div>
            <p className="text-sm text-slate-600 mt-1">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="rsm-btn-outline" onClick={() => onResolve(false)}>Cancelar</button>
          <button className="rsm-btn-danger" onClick={() => onResolve(true)} data-testid="confirm-ok">{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useConfirm() {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(({ title = "¿Estás seguro?", message = "", confirmLabel = "Confirmar" } = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({ title, message, confirmLabel });
    });
  }, []);

  const handleResolve = useCallback((result) => {
    setDialog(null);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const ConfirmPortal = dialog
    ? <ConfirmDialog {...dialog} onResolve={handleResolve} />
    : null;

  return { confirm, ConfirmPortal };
}
