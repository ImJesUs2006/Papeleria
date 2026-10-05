"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { usePosFeedback } from "@/store/pos-feedback";
import { cn } from "@/lib/utils";

/**
 * Capa de "snackbars" del POS (Fase 12): feedback al agregar productos
 * al carrito. Se monta en el techo, no bloquea la interacción.
 */
export function PosToastHost() {
  const toasts = usePosFeedback((s) => s.toasts);
  const dismiss = usePosFeedback((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex flex-col items-center gap-2 px-4 pt-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            initial={{ opacity: 0, y: -24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            onClick={() => dismiss(t.id)}
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 rounded-full border px-5 py-3 text-sm font-bold shadow-neon backdrop-blur",
              t.tipo === "ok" && "bg-neon-green/15 border-neon-green/50 text-neon-green",
              t.tipo === "error" && "bg-neon-red/15 border-neon-red/50 text-red-300",
              t.tipo === "warn" && "bg-neon-yellow/15 border-neon-yellow/50 text-warning"
            )}
            data-testid="pos-toast"
          >
            {t.tipo === "ok" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : t.tipo === "error" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
            <span className="max-w-[70vw] truncate">{t.mensaje}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}