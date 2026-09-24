"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const FRASE = "CONFIRMAR BORRADO";

// ============================================================
// Factory Reset NO destructivo (Fase 1).
// Pide contraseña del admin + frase exacta antes de reiniciar el
// SetupWizard a PENDIENTE. El servidor guarda un snapshot primero.
// ============================================================

export function FactoryResetButton() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ snapshotId: string } | null>(null);

  const fraseValida = confirmacion === FRASE;
  const puedeEnviar = fraseValida && password.length > 0 && !cargando;

  const enviar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/seguridad/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmacion, motivo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo reiniciar el sistema");
      setResultado(data);
    } catch (e: any) {
      setError(e?.message || "Error al reiniciar");
    } finally {
      setCargando(false);
    }
  };

  const cerrar = () => {
    if (cargando) return;
    setAbierto(false);
    setPassword("");
    setConfirmacion("");
    setMotivo("");
    setError(null);
    setResultado(null);
  };

  return (
    <>
      <div className="flex flex-col gap-2 pt-2">
        <span className="text-xs text-muted">
          Zona de riesgo · Reaparecerá el asistente de configuración
        </span>
        <button
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-2 w-fit px-4 py-2 rounded-xl border border-neon-red/40 bg-neon-red/5 text-neon-red text-sm font-bold hover:bg-neon-red/15 transition-all"
        >
          <RotateCcw className="h-4 w-4" />
          Reiniciar Sistema
        </button>
      </div>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={cerrar}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-800 border border-neon-red/40 rounded-3xl p-6 max-w-md w-full shadow-neon-glow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-neon-red/10 flex items-center justify-center">
                    {cargando ? (
                      <Loader2 className="h-5 w-5 text-neon-red animate-spin" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-neon-red" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-100">Reiniciar Sistema</h3>
                    <p className="text-xs text-muted">
                      Factory reset · se guarda un snapshot antes
                    </p>
                  </div>
                </div>
                <button
                  onClick={cerrar}
                  className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {resultado ? (
                <div className="flex flex-col items-center gap-3 py-4 text-center">
                  <ShieldCheck className="h-12 w-12 text-neon-green" />
                  <h4 className="text-base font-bold text-gray-100">
                    Sistema reiniciado con seguridad
                  </h4>
                  <p className="text-xs text-muted leading-relaxed">
                    Se creó el snapshot{" "}
                    <code className="text-neon-cyan">{resultado.snapshotId}</code> con la
                    configuración y totales previos. El asistente de configuración ahora
                    aparecerá en el próximo ingreso.
                  </p>
                  <button
                    onClick={() => {
                      router.replace("/setup");
                      router.refresh();
                    }}
                    className="w-full py-3 rounded-xl bg-neon-green text-btn-ink font-bold"
                  >
                    Ir al asistente (Setup)
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">
                        Contraseña de la administradora
                      </span>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="input-dark"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">
                        Escribe exactamente <code className="text-neon-red">{FRASE}</code>
                      </span>
                      <input
                        value={confirmacion}
                        onChange={(e) => setConfirmacion(e.target.value)}
                        placeholder={FRASE}
                        className={cn(
                          "input-dark",
                          !fraseValida && confirmacion.length > 0 && "border-neon-red/60 text-neon-red"
                        )}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">
                        Motivo (opcional)
                      </span>
                      <input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="p. ej. Cambio de gerencia"
                        className="input-dark"
                      />
                    </label>
                  </div>

                  {error && (
                    <div className="mt-3 flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-3 py-2.5 text-sm text-gray-100">
                      <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    onClick={enviar}
                    disabled={!puedeEnviar}
                    className={cn(
                      "mt-5 w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                      puedeEnviar
                        ? "bg-neon-red text-white hover:brightness-110"
                        : "bg-surface-600 text-muted cursor-not-allowed"
                    )}
                  >
                    {cargando ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Guardando snapshot…
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4" /> Confirmar reinicio
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-muted mt-2 leading-relaxed">
                    Esto NO borra productos ni ventas: guarda un snapshot de recuperación y
                    vuelve a mostrar el asistente de configuración.
                  </p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}