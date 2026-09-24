"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History,
  Loader2,
  X,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SnapshotResumen {
  id: string;
  fecha: string;
  motivo: string;
  motivoDetalle?: string;
  totalVentas: number;
  totalTransacciones: number;
  configVersion: number;
}

interface RecoveryHistoryProps {
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}

const formatearFecha = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

// ============================================================
// Historial de snapshots de seguridad (Fase 1).
// Permite restaurar la configuración como estaba ANTES de un
// reinicio del sistema. La restauración jamás toca ventas o
// sesiones: solo reescribe la fila de configuración firmada.
// ============================================================

export function RecoveryHistory({ open, onClose, onRestored }: RecoveryHistoryProps) {
  const [items, setItems] = useState<SnapshotResumen[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restaurar, setRestaurar] = useState<SnapshotResumen | null>(null);
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/seguridad/snapshot", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar historial");
      setItems(data.data ?? []);
    } catch (e: any) {
      setError(e?.message || "Error al cargar historial");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setRestaurar(null);
      setPassword("");
      cargar();
    }
  }, [open, cargar]);

  const confirmarRestaurar = async () => {
    if (!restaurar) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/seguridad/snapshot/${restaurar.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo restaurar");
      onRestored();
    } catch (e: any) {
      setError(e?.message || "Error al restaurar");
    } finally {
      setCargando(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-800 border border-surface-600 rounded-2xl p-6 max-w-lg w-full"
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-neon-cyan/10 flex items-center justify-center">
                  <History className="h-4 w-4 text-neon-cyan" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-100">
                    Historial de recuperación
                  </h3>
                  <p className="text-[11px] text-muted">
                    Snapshots guardados antes de reinicios
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-muted text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-3 py-2.5 text-sm text-gray-100 mt-3">
                <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" /> {error}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted text-sm mt-3">
                <ShieldCheck className="h-8 w-8 opacity-40" />
                No hay snapshots todavía. Se crean automáticamente al reiniciar el sistema.
              </div>
            ) : (
              <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
                {items.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-surface-600 bg-surface-700 p-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-100 truncate">
                        {s.motivo}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {formatearFecha(s.fecha)} · v{s.configVersion}
                      </p>
                      <p className="text-[11px] text-muted">
                        {s.totalVentas.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}{" "}
                        en {s.totalTransacciones} ventas
                      </p>
                    </div>
                    <button
                      onClick={() => setRestaurar(s)}
                      disabled={cargando}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan text-xs font-bold hover:bg-neon-cyan/20 transition-all shrink-0"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                    </button>
                  </div>
                ))}
              </div>
            )}

            <AnimatePresence>
              {restaurar && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 rounded-xl border border-neon-cyan/40 bg-neon-cyan/5 p-4"
                >
                  <p className="text-sm text-gray-100 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-neon-yellow shrink-0 mt-0.5" />
                    Se restaurará la configuración del snapshot{" "}
                    <b>{formatearFecha(restaurar.fecha)}</b>. Solo escribe el color, logo,
                    módulos y tipos de pago: las ventas y sesiones quedan intactas.
                  </p>
                  <label className="block mt-3">
                    <span className="text-[11px] text-muted mb-1 flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Contraseña de la administradora
                    </span>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="input-dark"
                    />
                  </label>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setRestaurar(null)}
                      className="flex-1 px-3 py-2.5 rounded-lg bg-surface-700 text-muted text-sm font-bold hover:text-gray-100 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={confirmarRestaurar}
                      disabled={cargando || password.length === 0}
                      className={cn(
                        "flex-1 px-3 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2",
                        cargando || password.length === 0
                          ? "bg-surface-600 text-muted cursor-not-allowed"
                          : "bg-neon-cyan text-btn-ink"
                      )}
                    >
                      {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
                      Restaurar
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && restaurar && (
              <div className="mt-2 flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-3 py-2 text-sm text-gray-100">
                <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" /> {error}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}