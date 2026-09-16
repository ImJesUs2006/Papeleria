"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  X,
  Banknote,
  Receipt,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  EyeOff,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// CORTE CIEGO
// 1) Inicia: ABIERTA → EN_CIERRE (el servidor bloquea ventas).
// 2) Conteo: solo campos físicos; NUNCA se muestran esperados.
// 3) Conclusión: el servidor calcula descuadre y lo audita.
// Si recarga la app a mitad, al estado EN_CIERRE se reanuda sola.
// ============================================================

interface Props {
  onCerrada: () => void;
  onCancelar: () => void;
}

type Fase = "iniciando" | "conteo" | "concluyendo" | "resultado" | "error";

interface ArqueoResultado {
  esperadoEfectivo: number;
  esperadoDigital: number;
  esperadoRecargas: number;
  declaradoEfectivo: number;
  declaradoDigital: number;
  declaradoRecargas: number;
  faltanteEfectivo: number;
  faltanteDigital: number;
  faltanteRecargas: number;
  totalEsperado: number;
  totalDeclarado: number;
  diferenciaTotal: number;
  descuadre: boolean;
}

export function CorteCiego({ onCerrada, onCancelar }: Props) {
  const [fase, setFase] = useState<Fase>("iniciando");
  const [token, setToken] = useState<string | null>(null);
  const [horaInicio, setHoraInicio] = useState<string | null>(null);
  const [efectivo, setEfectivo] = useState("");
  const [vouchers, setVouchers] = useState("");
  const [recargas, setRecargas] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ArqueoResultado | null>(null);

  useEffect(() => {
    // Reanuda un corte a medias (recarga o mata-app a mitad).
    let activo = true;
    (async () => {
      try {
        const res = await fetch("/api/caja/cerrar/iniciar", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.activo) {
            setToken(data.cierreToken);
            setHoraInicio(data.horaInicio);
            setFase("conteo");
          } else {
            setFase("iniciando");
          }
        }
      } catch {
        /* sin red: se mantiene la fase */
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const iniciarCorte = async () => {
    setFase("iniciando");
    setError(null);
    try {
      const res = await fetch("/api/caja/cerrar/iniciar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          // Otro corte quedó EN_CIERRE: intentamos reanudarlo.
          const estado = await fetch("/api/caja/cerrar/iniciar", { cache: "no-store" }).then((r) =>
            r.json()
          );
          if (estado.activo) {
            setToken(estado.cierreToken);
            setHoraInicio(estado.horaInicio);
            setFase("conteo");
            return;
          }
        }
        throw new Error(data.error || "No se pudo iniciar el corte");
      }
      setToken(data.cierreToken);
      setHoraInicio(data.horaInicio);
      setFase("conteo");
    } catch (e: any) {
      setError(e.message);
      setFase("error");
    }
  };

  const concluir = async () => {
    const e = parseFloat(efectivo || "0");
    const v = parseFloat(vouchers || "0");
    const r = parseFloat(recargas || "0");
    if (isNaN(e) || isNaN(v) || isNaN(r)) {
      setError("Montos inválidos");
      return;
    }
    setFase("concluyendo");
    setError(null);
    try {
      const res = await fetch("/api/caja/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cierreToken: token,
          efectivoContado: e,
          vouchersContado: v,
          recargasContado: r,
          notas: notas.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cerrar");
      setResultado(data.arqueo);
      setFase("resultado");
      window.print(); // tique de corte (área impresa queda en tique)
    } catch (err: any) {
      setError(err.message);
      setFase("error");
    }
  };

  const puedeConcluir = fraseValida(efectivo) || fraseValida(vouchers) || fraseValida(recargas);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 24 }}
        className="bg-surface-800 border border-surface-600 rounded-3xl p-7 max-w-md w-full"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-neon-red/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-neon-red" />
            </div>
            <div>
              <h3 className="font-black text-gray-100">Corte Ciego</h3>
              <p className="text-xs text-muted">Solo montos físicos · totales ocultos</p>
            </div>
          </div>
          {fase !== "concluyendo" && (
            <button
              onClick={onCancelar}
              className="h-9 w-9 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* FASE INICIAR */}
        {fase === "iniciando" && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 bg-neon-yellow/5 border border-neon-yellow/20 rounded-2xl p-4">
              <EyeOff className="h-5 w-5 text-neon-yellow shrink-0 mt-0.5" />
              <div className="text-sm text-gray-200">
                <p className="font-bold mb-1">¿Sabes cómo funciona?</p>
                <p className="text-muted">
                  Al confirmar, el sistema{" "}
                  <span className="text-neon-yellow font-bold">bloquea nuevas ventas</span> sin
                  mostrarte los totales esperados. Debes contar físicamente el efectivo y los
                  vouchers de terminal/transferencia.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Si cierras la aplicación o recargas a mitad del conteo, el corte queda marcado como{" "}
              <span className="text-gray-200">en progreso</span>: al volver, el sistema te obliga a
              concluirlo. No puede evadirse un descuadre.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={iniciarCorte}
              className="w-full py-3.5 rounded-2xl bg-neon-red text-white font-bold shadow-neon-magenta flex items-center justify-center gap-2"
            >
              <Loader2 className="h-4 w-4 animate-spin" /> Iniciar corte ciego
            </motion.button>
          </div>
        )}

        {/* FASE CONTEO */}
        {(fase === "conteo" || fase === "concluyendo") && (
          <div className="space-y-4">
            {horaInicio && (
              <p className="text-xs text-muted">
                Corte iniciado a las{" "}
                <span className="text-gray-200 font-medium">
                  {new Date(horaInicio).toLocaleTimeString("es-MX")}
                </span>
              </p>
            )}
            <div className="flex flex-col items-center py-3 text-center">
              <ClipboardList className="h-8 w-8 text-muted mb-2" />
              <p className="text-sm text-gray-100">
                Cuenta físicamente tu caja y registra:
              </p>
              <p className="text-[11px] text-muted">
                Los totales del sistema se calculan al concluir.
              </p>
            </div>

            <CampoMonto
              icon={<Banknote className="h-4 w-4 text-neon-green" />}
              label="Efectivo contado ($)"
              value={efectivo}
              onChange={setEfectivo}
              placeholder="Ej. 1250.50"
              cls="focus:border-neon-green"
            />
            <CampoMonto
              icon={<Receipt className="h-4 w-4 text-neon-cyan" />}
              label="Vouchers terminal / transferencias ($)"
              value={vouchers}
              onChange={setVouchers}
              placeholder="Ej. 340.00"
              cls="focus:border-neon-cyan"
            />
            <CampoMonto
              icon={<Smartphone className="h-4 w-4 text-neon-purple" />}
              label="Recargas contadas ($)"
              value={recargas}
              onChange={setRecargas}
              placeholder="Ej. 100.00"
              cls="focus:border-neon-purple"
            />

            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas del corte (opcional)"
              className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none transition-all"
            />

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={concluir}
              disabled={!puedeConcluir || fase === "concluyendo"}
              className={cn(
                "w-full py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all",
                puedeConcluir
                  ? "bg-neon-green text-surface-900 shadow-neon"
                  : "bg-surface-600 text-muted cursor-not-allowed"
              )}
            >
              {fase === "concluyendo" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Calculando...
                </>
              ) : (
                "Confirmar conteo"
              )}
            </motion.button>
          </div>
        )}

        {/* FASE RESULTADO */}
        {fase === "resultado" && resultado && (
          <div className="space-y-4 print-label-area">
            <div
              className={cn(
                "flex items-center gap-3 rounded-2xl p-4 border",
                resultado.descuadre
                  ? "bg-neon-red/10 border-neon-red/40"
                  : "bg-neon-green/10 border-neon-green/40"
              )}
            >
              {resultado.descuadre ? (
                <AlertTriangle className="h-8 w-8 text-neon-red shrink-0" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-neon-green shrink-0" />
              )}
              <div>
                <p className="font-black text-gray-100">
                  {resultado.descuadre ? "Descuadre detectado" : "Caja cuadrada"}
                </p>
                <p className="text-xs text-muted">
                  {resultado.diferenciaTotal > 0
                    ? `Faltante: $${resultado.diferenciaTotal.toFixed(2)}`
                    : resultado.diferenciaTotal < 0
                      ? `Sobrante: $${Math.abs(resultado.diferenciaTotal).toFixed(2)}`
                      : "Sin diferencia"}
                </p>
              </div>
            </div>

            <div className="print-resumen space-y-1.5 text-sm">
              <FilaResumen
                label="Efectivo esperado"
                valor={`$${resultado.esperadoEfectivo.toFixed(2)}`}
              />
              <FilaResumen
                label="Efectivo contado"
                valor={`$${resultado.declaradoEfectivo.toFixed(2)}`}
              />
              <FilaResumen
                label="Vouchers esperados"
                valor={`$${resultado.esperadoDigital.toFixed(2)}`}
              />
              <FilaResumen
                label="Vouchers contados"
                valor={`$${resultado.declaradoDigital.toFixed(2)}`}
              />
              <FilaResumen
                label="Recargas esperadas"
                valor={`$${resultado.esperadoRecargas.toFixed(2)}`}
              />
              <FilaResumen
                label="Recargas contadas"
                valor={`$${resultado.declaradoRecargas.toFixed(2)}`}
              />
              <div className="border-t border-surface-500 pt-2 mt-2 flex justify-between items-center">
                <span className="font-bold text-gray-100">Diferencia total</span>
                <span
                  className={cn(
                    "font-black text-xl",
                    resultado.descuadre ? "text-neon-red" : "text-neon-green"
                  )}
                >
                  ${resultado.diferenciaTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onCerrada}
              className="w-full py-3.5 rounded-2xl bg-neon-green text-surface-900 font-bold shadow-neon"
            >
              Terminar
            </motion.button>
            <p className="text-center text-[10px] text-muted print-hint">
              (El reporte detallado queda en Reportes → Cierre de Caja)
            </p>
          </div>
        )}

        {/* FASE ERROR */}
        {fase === "error" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-neon-red/10 border border-neon-red/40 rounded-2xl p-4">
              <AlertTriangle className="h-5 w-5 text-neon-red shrink-0 mt-0.5" />
              <p className="text-sm text-gray-100">{error}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFase("conteo")}
                className="py-3 rounded-xl border border-surface-500 text-muted hover:text-gray-100 transition-colors"
              >
                Reintentar
              </button>
              <button
                onClick={onCancelar}
                className="py-3 rounded-xl bg-surface-600 text-gray-200 font-bold transition-colors"
              >
                Salir
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function fraseValida(v: string): boolean {
  return v.trim() !== "" && !isNaN(parseFloat(v)) && parseFloat(v) >= 0;
}

function CampoMonto({
  icon,
  label,
  value,
  onChange,
  placeholder,
  cls,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  cls?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted mb-1 flex items-center gap-2">
        {icon} {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-lg text-gray-100 font-bold focus:outline-none transition-all",
          cls
        )}
      />
    </label>
  );
}

function FilaResumen({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-gray-100">{valor}</span>
    </div>
  );
}