"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useOffline } from "@/hooks/use-offline";
import { cn } from "@/lib/utils";

export function OfflineIndicator() {
  const { online, pendientes, sincronizando, ultimoResultado, sincronizar } = useOffline();

  const mostrar = !online || pendientes > 0 || sincronizando || !!ultimoResultado;

  return (
    <AnimatePresence>
      {mostrar && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className={cn(
            "fixed top-4 right-4 z-40 flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium backdrop-blur",
            !online
              ? "bg-neon-red/15 border-neon-red/40 text-neon-red"
              : ultimoResultado
                ? "bg-neon-green/15 border-neon-green/40 text-neon-green"
                : "bg-neon-yellow/15 border-neon-yellow/40 text-neon-yellow"
          )}
        >
          {!online ? (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              Sin conexión
              {pendientes > 0 && <span className="opacity-80">· {pendientes} en cola</span>}
            </>
          ) : ultimoResultado ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {ultimoResultado}
            </>
          ) : sincronizando ? (
            <>
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <Wifi className="h-3.5 w-3.5" />
              {pendientes} venta{pendientes === 1 ? "" : "s"} por sincronizar
              <button
                onClick={sincronizar}
                className="ml-1 underline underline-offset-2 hover:opacity-80"
              >
                Sincronizar
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}