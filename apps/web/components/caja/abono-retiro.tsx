"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  HandCoins,
  Search,
  Plus,
  Loader2,
  X,
  Check,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Cliente {
  idCliente: string;
  nombre: string;
  telefono: string | null;
  saldoDeudor: number;
  puntosFidelidad: number;
}

interface Props {
  /** Caja ABIERTA vigente (si no, no se muestran acciones). */
  sesion: { idCaja: string; estado: string; totalRetiros?: number } | null;
  /** Solo la administradora puede autorizar retiros. */
  esAdmin: boolean;
  /** Re-consulta el estado de la caja tras un abono/retiro. */
  onCambio: () => void;
}

/** Acciones de sesión: Abono de Cliente (CRM) y Retiro de Efectivo (Admin). */
export function AccionesSesion({ sesion, esAdmin, onCambio }: Props) {
  const [abierto, setAbierto] = useState<null | "abono" | "retiro">(null);

  if (!sesion || sesion.estado !== "ABIERTA") return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setAbierto("abono")}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-400/10 border border-amber-400/40 text-amber-300 text-sm font-bold hover:bg-amber-400/20 transition-colors"
        >
          <Users className="h-4 w-4" /> Abono de cliente
        </motion.button>
        {esAdmin && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setAbierto("retiro")}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-neon-red/10 border border-neon-red/40 text-neon-red text-sm font-bold hover:bg-neon-red/20 transition-colors"
          >
            <ShieldCheck className="h-4 w-4" /> Retiro de efectivo
          </motion.button>
        )}
      </div>

      {abierto === "abono" && (
        <ModalAbono
          idCaja={sesion.idCaja}
          onClose={() => setAbierto(null)}
          onRegistrado={() => {
            setAbierto(null);
            onCambio();
          }}
        />
      )}
      {abierto === "retiro" && esAdmin && (
        <ModalRetiro
          idCaja={sesion.idCaja}
          onClose={() => setAbierto(null)}
          onRegistrado={() => {
            setAbierto(null);
            onCambio();
          }}
        />
      )}
    </>
  );
}

/* ================= Abono de cliente ================= */

function ModalAbono({
  idCaja,
  onClose,
  onRegistrado,
}: {
  idCaja: string;
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const [query, setQuery] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [seleccion, setSeleccion] = useState<Cliente | null>(null);
  const [monto, setMonto] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = useCallback(async (q: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}&soloConDeuda=true`);
      if (res.ok) {
        const data = await res.json();
        setClientes(data.clientes ?? []);
      }
    } catch {
      setClientes([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    buscar("");
  }, [buscar]);

  const registrar = async () => {
    const valor = parseFloat(monto);
    if (!seleccion || isNaN(valor) || valor <= 0) return;
    setProcesando(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes/${seleccion.idCliente}/abonos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto: valor, idCaja }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo registrar el abono");
        return;
      }
      onRegistrado();
    } catch {
      setError("Error de conexión al registrar el abono");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 border border-amber-400/40 rounded-3xl p-6 max-w-md w-full max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-400" />
            <h3 className="font-black text-gray-100">Abono de cliente</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-muted mb-4">
          El abono ingresa dinero a la caja y reduce la deuda del cliente.
        </p>

        {!seleccion ? (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  buscar(e.target.value);
                }}
                placeholder="Buscar cliente con deuda..."
                className="w-full bg-surface-700 border border-surface-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-amber-400 focus:outline-none transition-all"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
              {cargando ? (
                <div className="flex items-center justify-center py-8 text-muted">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Buscando...
                </div>
              ) : clientes.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">
                  No hay clientes con saldo deudor o sin coincidencias.
                </p>
              ) : (
                clientes.map((c) => (
                  <button
                    key={c.idCliente}
                    onClick={() => setSeleccion(c)}
                    className="w-full flex items-center justify-between bg-surface-700 hover:bg-surface-600 rounded-xl px-4 py-3 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-100 truncate">{c.nombre}</p>
                      <p className="text-xs text-muted">
                        {c.telefono ? `${c.telefono} · ` : ""}
                        {c.puntosFidelidad} pts
                      </p>
                    </div>
                    <span className="text-xs font-bold text-neon-yellow shrink-0">
                      ${c.saldoDeudor.toFixed(2)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <div className="bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 mb-4">
              <p className="text-sm font-bold text-gray-100">{seleccion.nombre}</p>
              <p className="text-xs text-neon-yellow">
                Deuda actual: ${seleccion.saldoDeudor.toFixed(2)}
              </p>
            </div>
            <label className="block mb-2">
              <span className="text-xs text-muted mb-1 block">Monto del abono ($)</span>
              <input
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                min={0}
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-xl text-amber-300 font-black focus:border-amber-400 focus:outline-none transition-all"
              />
            </label>
            {error && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 mb-3">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => setSeleccion(null)}
                className="py-3 rounded-xl bg-surface-700 text-muted text-sm font-bold hover:bg-surface-600 transition-colors"
              >
                Volver
              </button>
              <button
                onClick={registrar}
                disabled={procesando || !monto || parseFloat(monto) <= 0}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all",
                  procesando || !monto || parseFloat(monto) <= 0
                    ? "bg-surface-600 text-muted cursor-not-allowed"
                    : "bg-amber-400 text-btn-ink shadow-neon"
                )}
              >
                {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Registrar abono
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

/* ================= Retiro de efectivo (Admin) ================= */

function ModalRetiro({
  idCaja,
  onClose,
  onRegistrado,
}: {
  idCaja: string;
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registrar = async () => {
    const valor = parseFloat(monto);
    if (isNaN(valor) || valor <= 0 || motivo.trim().length < 2) return;
    setProcesando(true);
    setError(null);
    try {
      const res = await fetch("/api/caja/retiros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto: valor, idCaja, motivo: motivo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo registrar el retiro");
        return;
      }
      onRegistrado();
    } catch {
      setError("Error de conexión al registrar el retiro");
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 border border-neon-red/40 rounded-3xl p-6 max-w-md w-full"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-neon-red" />
            <h3 className="font-black text-gray-100">Retiro de efectivo</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-start gap-2 bg-neon-red/10 border border-neon-red/30 rounded-xl px-3 py-2.5 mb-4">
          <AlertTriangle className="h-4 w-4 text-neon-red shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-200">
            Acción de gerencia: el efectivo sale de la caja y el corte ciego lo restará del
            monto esperado para no marcar descuadre.
          </p>
        </div>

        <label className="block mb-3">
          <span className="text-xs text-muted mb-1 block">Monto a retirar ($)</span>
          <input
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            min={0}
            className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-xl text-neon-red font-black focus:border-neon-red focus:outline-none transition-all"
            autoFocus
          />
        </label>
        <label className="block mb-4">
          <span className="text-xs text-muted mb-1 block">Motivo *</span>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. Compra de insumos, pago de proveedor"
            className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:border-neon-red focus:outline-none transition-all"
          />
        </label>

        {error && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="py-3 rounded-xl bg-surface-700 text-muted text-sm font-bold hover:bg-surface-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={registrar}
            disabled={procesando || !monto || parseFloat(monto) <= 0 || motivo.trim().length < 2}
            className={cn(
              "flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all",
              procesando || !monto || parseFloat(monto) <= 0 || motivo.trim().length < 2
                ? "bg-surface-600 text-muted cursor-not-allowed"
                : "bg-neon-red text-btn-ink shadow-neon"
            )}
          >
            {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
            Retirar
          </button>
        </div>
      </motion.div>
    </div>
  );
}