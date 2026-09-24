"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  Smartphone,
  TrendingUp,
  Lock,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Loader2,
  History,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { CorteCiego } from "@/components/caja/corte-ciego";
import { HistorialCaja } from "@/components/caja/historial";
import { AccionesSesion } from "@/components/caja/abono-retiro";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

interface SesionCaja {
  idCaja: string;
  fondoInicial: number;
  totalVentasEfectivo: number;
  totalVentasDigital: number;
  totalRecargas: number;
  totalRetiros?: number;
  horaApertura: string;
  estado: "ABIERTA" | "EN_CIERRE" | "CERRADA";
  cierreInicioEn?: string | null;
}

type FlujoIngreso = "PAPELERIA" | "RECARGA";

export default function CajaPage() {
  const [sesionActual, setSesionActual] = useState<SesionCaja | null>(null);
  const [fondoInicial, setFondoInicial] = useState("");
  const [showCorteCiego, setShowCorteCiego] = useState(false);
  const [ingresoPapa, setIngresoPapa] = useState("");
  const [ingresoRecarga, setIngresoRecarga] = useState("");
  const [procesando, setProcesando] = useState<FlujoIngreso | null>(null);
  const [notaOK, setNotaOK] = useState<string | null>(null);
  const [cargandoEstado, setCargandoEstado] = useState(true);
  const [tab, setTab] = useState<"sesion" | "historial">("sesion");
  const rol = useAuthStore((s) => s.rol);
  const esAdmin = rol === "ADMINISTRADORA";

  useEffect(() => {
    // Restaura la sesión vigente (incl. un corte EN_CIERRE a medias).
    (async () => {
      try {
        const res = await fetch("/api/caja/estado", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.sesion) {
            setSesionActual(data.sesion);
            if (data.sesion.estado === "EN_CIERRE") setShowCorteCiego(true);
          }
        }
      } finally {
        setCargandoEstado(false);
      }
    })();
  }, []);

  const handleAbrirCaja = async () => {
    const fondo = parseFloat(fondoInicial);
    if (isNaN(fondo) || fondo < 0) return;

    const res = await fetch("/api/caja/abrir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fondoInicial: fondo }),
    });

    if (res.ok) {
      const data = await res.json();
      setSesionActual({ ...data, ...zeroTotals(data) });
      setFondoInicial("");
    }
  };

  // Asegura que los totales existan (el seed puede devolverlos sin inicializar)
  const zeroTotals = (data: any) => ({
    totalVentasEfectivo: Number(data.totalVentasEfectivo ?? 0),
    totalVentasDigital: Number(data.totalVentasDigital ?? 0),
    totalRecargas: Number(data.totalRecargas ?? 0),
    totalRetiros: Number(data.totalRetiros ?? 0),
    fondoInicial: Number(data.fondoInicial ?? 0),
  });

  // Tras un abono/retiro re-consulta la sesión para reflejar la caja.
  const refrescarSesion = async () => {
    try {
      const res = await fetch("/api/caja/estado", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.sesion) setSesionActual({ ...data.sesion, ...zeroTotals(data.sesion) });
        else setSesionActual(null);
      }
    } catch {
      /* sin conexión: se mantiene el estado visual */
    }
  };

  const handleRegistrarIngreso = async (tipo: FlujoIngreso) => {
    const monto = parseFloat(tipo === "PAPELERIA" ? ingresoPapa : ingresoRecarga);
    if (isNaN(monto) || monto <= 0) return;

    setProcesando(tipo);
    setNotaOK(null);
    try {
      const res = await fetch("/api/caja/ingreso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, monto }),
      });

      if (res.ok) {
        const data = await res.json();
        setSesionActual((prev) => (prev ? { ...prev, ...zeroTotals(data) } : prev));
        if (tipo === "PAPELERIA") setIngresoPapa("");
        else setIngresoRecarga("");
        setNotaOK(
          tipo === "PAPELERIA"
            ? `Ingreso papelería por $${monto.toFixed(2)} registrado`
            : `Recarga por $${monto.toFixed(2)} registrada`
        );
      }
    } finally {
      setProcesando(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-black text-gray-100 mb-1">
            Control de Caja
          </h2>
          <p className="text-sm text-muted">
            Apertura, cierre y control de efectivo/digital
          </p>
        </motion.div>

        <div className="flex gap-1 mb-6 bg-surface-800 p-1 rounded-xl w-fit">
          {(
            [
              { id: "sesion", label: "Sesión actual", icon: DollarSign },
              { id: "historial", label: "Historial de sesiones", icon: History },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                tab === id ? "bg-surface-600 text-gray-100" : "text-muted hover:text-gray-100"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "historial" ? (
          <HistorialCaja />
        ) : (
        <>
        {cargandoEstado ? (
          <div className="max-w-md mx-auto">
            <div className="bg-surface-800 border border-surface-600 rounded-2xl p-8 space-y-4">
              <div className="animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-surface-600" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded bg-surface-600" />
                    <div className="h-3 w-24 rounded bg-surface-600" />
                  </div>
                </div>
                <div className="h-4 w-40 rounded bg-surface-600" />
                <div className="h-14 rounded-xl bg-surface-600" />
                <div className="h-12 rounded-xl bg-surface-600" />
              </div>
            </div>
          </div>
        ) : !sesionActual ? (
          /* Apertura de caja */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto"
          >
            <div className="bg-surface-800 border border-surface-600 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-12 w-12 rounded-xl bg-neon-green/10 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-neon-green" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-100">
                    Abrir Caja
                  </h3>
                  <p className="text-xs text-muted">
                    Registra el fondo inicial del día
                  </p>
                </div>
              </div>

              <label className="block mb-4">
                <span className="text-sm text-muted mb-1 block">
                  Fondo inicial ($)
                </span>
                <input
                  type="number"
                  value={fondoInicial}
                  onChange={(e) => setFondoInicial(e.target.value)}
                  placeholder="500.00"
                  className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-lg text-gray-100 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
                />
              </label>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleAbrirCaja}
                disabled={!fondoInicial}
                className={cn(
                  "w-full py-3 rounded-xl font-bold transition-all",
                  fondoInicial
                    ? "bg-neon-green text-btn-ink shadow-neon"
                    : "bg-surface-600 text-muted cursor-not-allowed"
                )}
              >
                Abrir Caja
              </motion.button>
            </div>
          </motion.div>
        ) : (
          /* Vista de caja abierta - SEPARACIÓN VISUAL */
          <div className="space-y-6">
            {/* Status bar */}
            <div className="flex items-center justify-between bg-surface-800 border border-surface-600 rounded-xl px-6 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-3 w-3 rounded-full animate-pulse",
                    sesionActual.estado === "EN_CIERRE"
                      ? "bg-neon-red"
                      : "bg-neon-green"
                  )}
                />
                <span className="text-sm font-medium text-gray-100">
                  {sesionActual.estado === "EN_CIERRE" ? (
                    <>
                      Corte ciego en curso desde{" "}
                      {sesionActual.cierreInicioEn
                        ? new Date(sesionActual.cierreInicioEn).toLocaleTimeString("es-MX")
                        : new Date().toLocaleTimeString("es-MX")}
                    </>
                  ) : (
                    <>
                      Caja Abierta desde{" "}
                      {new Date(sesionActual.horaApertura).toLocaleTimeString(
                        "es-MX"
                      )}
                    </>
                  )}
                </span>
              </div>
              <button
                onClick={() => setShowCorteCiego(true)}
                className="flex items-center gap-2 px-4 py-2 bg-neon-red/10 border border-neon-red/30 rounded-lg text-neon-red text-sm font-medium hover:bg-neon-red/20 transition-colors"
              >
                <Lock className="h-4 w-4" />
                {sesionActual.estado === "EN_CIERRE" ? "Continuar corte" : "Cerrar Caja"}
              </button>
            </div>

            {/* Confirmación inline de ingreso registrado */}
            <AnimatePresence>
              {notaOK && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 bg-neon-green/10 border border-neon-green/40 rounded-xl px-4 py-3"
                >
                  <CheckCircle2 className="h-5 w-5 text-neon-green shrink-0" />
                  <p className="text-sm text-gray-100 flex-1">{notaOK}</p>
                  <button
                    onClick={() => setNotaOK(null)}
                    className="text-xs text-muted hover:text-gray-100"
                  >
                    Cerrar
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* SEPARACIÓN DE FLUJOS - CRÍTICO */}
            {sesionActual.estado === "EN_CIERRE" ? (
              <div className="bg-surface-800 border-2 border-neon-red/40 rounded-2xl p-8 text-center">
                <div className="h-12 w-12 mx-auto rounded-xl bg-neon-red/10 flex items-center justify-center mb-4">
                  <Lock className="h-6 w-6 text-neon-red" />
                </div>
                <h3 className="font-black text-gray-100 mb-1">
                  Corte ciego en curso
                </h3>
                <p className="text-sm text-muted max-w-sm mx-auto">
                  Los montos están ocultos. Continúa el conteo físico con el
                  botón{" "}
                  <span className="text-neon-red font-medium">
                    &quot;Continuar corte&quot;
                  </span>{" "}
                  de arriba.
                </p>
              </div>
            ) : (
              <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Flujo Papelería */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-surface-800 border-2 border-neon-green/40 rounded-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-neon-green/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-neon-green" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-100">Papelería</h3>
                    <p className="text-xs text-muted">Ventas de productos</p>
                  </div>
                </div>

                <div className="text-3xl lg:text-4xl font-black text-neon-green text-glow-green mb-4">
                  ${sesionActual.totalVentasEfectivo.toFixed(2)}
                </div>

                <div className="space-y-2 text-sm mb-5">
                  <div className="flex justify-between text-muted">
                    <span>Efectivo</span>
                    <span className="text-gray-100">
                      ${sesionActual.totalVentasEfectivo.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-muted">
                    <span>Digital/Tarjeta</span>
                    <span className="text-gray-100">
                      ${sesionActual.totalVentasDigital.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Input de ingreso exclusivo de Papelería */}
                <div className="border-t border-neon-green/20 pt-4">
                  <label className="block mb-2">
                    <span className="text-xs font-bold text-neon-green uppercase tracking-wider">
                      Registrar ingreso papelería
                    </span>
                    <div className="flex gap-2 mt-2">
                      <input
                        type="number"
                        value={ingresoPapa}
                        onChange={(e) => setIngresoPapa(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-surface-700 border-2 border-neon-green/40 rounded-xl px-4 py-3 text-lg text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
                      />
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRegistrarIngreso("PAPELERIA")}
                        disabled={!ingresoPapa || procesando !== null}
                        className={cn(
                          "flex items-center gap-2 px-4 rounded-xl font-bold transition-all shrink-0",
                          ingresoPapa && procesando === null
                            ? "bg-neon-green text-btn-ink shadow-neon"
                            : "bg-surface-600 text-muted cursor-not-allowed"
                        )}
                      >
                        {procesando === "PAPELERIA" ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </motion.button>
                    </div>
                  </label>
                </div>
              </motion.div>

              {/* Flujo Recargas - SEPARADO */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-surface-800 border-2 border-neon-cyan/40 rounded-2xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-lg bg-neon-cyan/10 flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-neon-cyan" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-100">Recargas</h3>
                    <p className="text-xs text-muted">
                      Recargas telefónicas
                    </p>
                  </div>
                </div>

                <div className="text-3xl lg:text-4xl font-black text-neon-cyan text-glow-cyan mb-4">
                  ${sesionActual.totalRecargas.toFixed(2)}
                </div>

                <div className="p-3 bg-neon-cyan/5 rounded-lg border border-neon-cyan/20 mb-5">
                  <div className="flex items-center gap-2 text-xs text-neon-cyan">
                    <AlertTriangle className="h-3 w-3" />
                    <span>
                      Flujo separado intencionalmente para evitar descuadres
                    </span>
                  </div>
                </div>

                {/* Input de ingreso exclusivo de Recargas */}
                <div className="border-t border-neon-cyan/20 pt-4">
                  <label className="block mb-2">
                    <span className="text-xs font-bold text-neon-cyan uppercase tracking-wider">
                      Registrar recarga
                    </span>
                    <div className="flex gap-2 mt-2">
                      <input
                        type="number"
                        value={ingresoRecarga}
                        onChange={(e) => setIngresoRecarga(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-surface-700 border-2 border-neon-cyan/40 rounded-xl px-4 py-3 text-lg text-gray-100 placeholder:text-muted/50 focus:border-neon-cyan focus:shadow-neon-cyan focus:outline-none transition-all"
                      />
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleRegistrarIngreso("RECARGA")}
                        disabled={!ingresoRecarga || procesando !== null}
                        className={cn(
                          "flex items-center gap-2 px-4 rounded-xl font-bold transition-all shrink-0",
                          ingresoRecarga && procesando === null
                            ? "bg-neon-cyan text-btn-ink shadow-neon-cyan"
                            : "bg-surface-600 text-muted cursor-not-allowed"
                        )}
                      >
                        {procesando === "RECARGA" ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )}
                      </motion.button>
                    </div>
                  </label>
                </div>
              </motion.div>
            </div>

            {/* Total balanceado */}
            <div className="bg-surface-800 border border-surface-600 rounded-xl p-6">
              <div className="flex justify-between items-center">
                <span className="text-muted">Total en caja</span>
                <span className="text-2xl font-black text-gray-100">
                  $
                  {Math.max(
                    sesionActual.fondoInicial +
                      sesionActual.totalVentasEfectivo +
                      sesionActual.totalRecargas -
                      (sesionActual.totalRetiros ?? 0),
                    0
                  ).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2 text-sm">
                <span className="text-muted">Fondo inicial</span>
                <span className="text-gray-100">
                  ${sesionActual.fondoInicial.toFixed(2)}
                </span>
              </div>
              {(sesionActual.totalRetiros ?? 0) > 0 && (
                <div className="flex justify-between items-center mt-1 text-sm">
                  <span className="text-muted">Retiros autorizados</span>
                  <span className="text-neon-red">
                    -${(sesionActual.totalRetiros ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Acciones de sesión: abonos (CRM) y retiros (Admin, Fase 3) */}
            <AccionesSesion
              sesion={sesionActual}
              esAdmin={esAdmin}
              onCambio={refrescarSesion}
            />
            </>
            )}
          </div>
        )}
        </>
        )}

        {/* Modal Corte Ciego */}
        <AnimatePresence>
          {showCorteCiego && (
            <CorteCiego
              onCancelar={() => setShowCorteCiego(false)}
              onCerrada={() => {
                setSesionActual(null);
                setShowCorteCiego(false);
                setNotaOK(null);
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}