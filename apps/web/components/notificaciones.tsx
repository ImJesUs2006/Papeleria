"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useNotificaciones, type TipoNotificacion } from "@/store/notificaciones";
import { cn } from "@/lib/utils";

// Capa de notificaciones deslizantes. Viven abajo a la izquierda del área
// de contenido (junto al menú): así nunca tapan el carrito ni el botón de
// cobrar del punto de venta. Entran deslizándose, se apilan y se van solas.
const ESTILO: Record<TipoNotificacion, { icono: typeof Info; cls: string }> = {
  exito: { icono: CheckCircle2, cls: "border-emerald-500/50 text-emerald-300" },
  error: { icono: XCircle, cls: "border-rose-500/50 text-rose-300" },
  aviso: { icono: AlertTriangle, cls: "border-amber-500/50 text-amber-300" },
  info: { icono: Info, cls: "border-sky-500/50 text-sky-300" },
};

export function NotificacionesHost() {
  const notificaciones = useNotificaciones((s) => s.notificaciones);
  const quitar = useNotificaciones((s) => s.quitar);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-[17rem] z-[80] flex w-[min(24rem,calc(100vw-18rem))] flex-col items-start gap-2"
    >
      <AnimatePresence initial={false}>
        {notificaciones.map((n) => {
          const { icono: Icono, cls } = ESTILO[n.tipo];
          return (
            <motion.div
              key={n.id}
              layout
              role={n.tipo === "error" ? "alert" : "status"}
              initial={{ opacity: 0, x: -60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-xl border bg-surface-800 px-4 py-3 shadow-card",
                cls
              )}
              data-testid="notificacion"
            >
              <Icono className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="break-anywhere text-sm font-bold text-gray-100">{n.titulo}</p>
                {n.detalle && <p className="break-anywhere mt-0.5 text-xs text-muted">{n.detalle}</p>}
              </div>
              <button
                type="button"
                onClick={() => quitar(n.id)}
                aria-label="Cerrar notificación"
                className="shrink-0 text-muted hover:text-gray-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
