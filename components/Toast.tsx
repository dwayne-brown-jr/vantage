"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { Check, TriangleAlert, Undo2, X } from "lucide-react";

interface ToastInput {
  message: string;
  tone?: "ok" | "error" | "info";
  action?: { label: string; onClick: () => void };
}
interface ToastItem extends ToastInput {
  id: string;
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => setToasts((x) => x.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = crypto.randomUUID();
      setToasts((x) => [...x, { ...t, id }]);
      setTimeout(() => remove(id), t.action ? 7000 : 3500);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={"toast " + (t.tone ?? "info")}>
            {t.tone === "ok" && <Check size={15} className="flex-none" />}
            {t.tone === "error" && <TriangleAlert size={15} className="flex-none" />}
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  remove(t.id);
                }}
              >
                <Undo2 size={13} /> {t.action.label}
              </button>
            )}
            <button className="toast-x" aria-label="Dismiss" onClick={() => remove(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
