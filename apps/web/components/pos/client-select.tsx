"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, Plus, Loader2, X, Check, Coins, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { puntosRequeridos } from "@/lib/fidelidad";
import { VirtualCard } from "@/components/pos/virtual-card";

interface Cliente {
  idCliente: string;
  nombre: string;
  telefono: string | null;
  saldoDeudor: number;
  puntosFidelidad: number;
  nivel: "MENUDEO" | "MAYOREO";
  montoHistorico: number;
}

export interface ClienteSeleccionado {
  idCliente: string;
  nombre: string;
  puntosFidelidad: number;
  nivel: "MENUDEO" | "MAYOREO";
  montoHistorico: number;
}

interface Props {
  open: boolean;
  modo: "credito" | "monedero";
  totalVenta: number;
  valorPuntoPesos?: number;
  onClose: () => void;
  onSelect: (cliente: ClienteSeleccionado) => void;
}

/**
 * Modal de selección/alta de cliente para ventas a Crédito de Tienda o
 * Puntos Monedero (Fase 12). En modo `monedero` muestra la tarjeta virtual
 * del cliente y valida el saldo antes de confirmar el canje.
 */
export function ClientSelectModal({
  open,
  modo,
  totalVenta,
  valorPuntoPesos,
  onClose,
  onSelect,
}: Props) {
  const esMonedero = modo === "monedero";
  const [query, setQuery] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Cliente | null>(null);

  const buscar = useCallback(async (q: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setClientes(data.clientes ?? []);
      } else {
        setClientes([]);
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudieron cargar clientes");
      }
    } catch {
      setClientes([]);
      setError("Error de conexión al buscar clientes");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setError(null);
      setMostrarAlta(false);
      setConfirmar(null);
      buscar("");
    }
  }, [open, buscar]);

  const enviar = (c: Cliente) => {
    onSelect({
      idCliente: c.idCliente,
      nombre: c.nombre,
      puntosFidelidad: c.puntosFidelidad,
      nivel: c.nivel,
      montoHistorico: c.montoHistorico,
    });
    onClose();
  };

  const elegirCliente = (c: Cliente) => {
    // Crédito: se asigna y cierra directo (flujo Fase 3).
    if (!esMonedero) {
      enviar(c);
      return;
    }
    // Monedero: se muestra la tarjeta y se confirma el canje.
    setConfirmar(c);
  };

  const crearYSeleccionar = async () => {
    if (nombre.trim().length < 2) {
      setError("Escribe el nombre del cliente (mín 2 caracteres)");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), telefono: telefono.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo registrar el cliente");
        return;
      }
      const nuevo: Cliente = {
        idCliente: data.cliente.idCliente,
        nombre: data.cliente.nombre,
        telefono: data.cliente.telefono ?? null,
        saldoDeudor: Number(data.cliente.saldoDeudor ?? 0),
        puntosFidelidad: Number(data.cliente.puntosFidelidad ?? 0),
        nivel: data.cliente.nivel ?? "MENUDEO",
        montoHistorico: Number(data.cliente.montoHistorico ?? 0),
      };
      setConfirmar(null);
      setMostrarAlta(false);
      if (!esMonedero) {
        enviar(nuevo);
      } else {
        // El nuevo cliente sin historial no puede pagar con puntos aún;
        // se muestra la tarjeta para que la cajera lo entienda.
        setConfirmar(nuevo);
      }
    } catch {
      setError("Error de conexión al registrar el cliente");
    } finally {
      setGuardando(false);
    }
  };

  const valorPunto = valorPuntoPesos && valorPuntoPesos > 0 ? valorPuntoPesos : 1;
  const ptsNecesarios = esMonedero && confirmar ? puntosRequeridos(totalVenta, valorPunto) : 0;
  const alcanzan = esMonedero && confirmar
    ? confirmar.puntosFidelidad >= ptsNecesarios
    : true;

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
            initial={{ scale: 0.9, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-800 border border-surface-600 rounded-3xl p-6 max-w-lg w-full max-h-[85vh] flex flex-col"
          >
            {esMonedero && confirmar ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-neon-yellow" />
                  <h3 className="font-black text-gray-100">Confirmar pago con puntos</h3>
                </div>

                <VirtualCard
                  nombre={confirmar.nombre}
                  nivel={confirmar.nivel}
                  puntos={confirmar.puntosFidelidad}
                  valorPuntoPesos={valorPunto}
                />

                <div className="bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Total a pagar</span>
                    <span className="font-bold text-gray-100">${totalVenta.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Puntos que se usarán</span>
                    <span className="font-bold text-neon-yellow">{ptsNecesarios} pts</span>
                  </div>
                  <p className="text-[11px] text-muted">
                    Cada punto cubre ${valorPunto.toFixed(2)} al pagar.
                  </p>
                </div>

                {!alcanzan && (
                  <div className="flex items-start gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-3">
                    <Coins className="h-4 w-4 text-neon-red shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-100">
                      Saldo insuficiente: el cliente tiene{" "}
                      <b>{confirmar.puntosFidelidad} pts</b> y esta venta requiere{" "}
                      <b>{ptsNecesarios} pts</b>. Cambia a otro método de pago o elige
                      otro cliente.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirmar(null)}
                    className="py-3 rounded-xl bg-surface-700 text-muted text-sm font-bold hover:bg-surface-600 transition-colors"
                  >
                    Cambiar cliente
                  </button>
                  <button
                    onClick={() => enviar(confirmar)}
                    disabled={!alcanzan}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all",
                      alcanzan
                        ? "bg-neon-yellow text-btn-ink shadow-neon"
                        : "bg-surface-600 text-muted cursor-not-allowed"
                    )}
                  >
                    <Coins className="h-4 w-4" />
                    Usar {ptsNecesarios} pts
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={cn(
                      "flex items-center gap-2",
                      esMonedero ? "text-neon-yellow" : "text-neon-green"
                    )}
                  >
                    {esMonedero ? <Coins className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                    <h3 className="font-black text-gray-100">
                      {esMonedero ? "Puntos Monedero" : "Crédito de Tienda"}
                    </h3>
                  </div>
                  <button onClick={onClose} className="text-muted hover:text-gray-100">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-xs text-muted mb-4">
                  {esMonedero ? (
                    <>
                      El cliente canjea su saldo de puntos en esta venta. Elige a la
                      persona para ver su tarjeta de fidelidad y confirmar el canje.
                    </>
                  ) : (
                    <>
                      La venta se cargará al saldo del cliente (no ingresa a caja) y
                      suma 1 punto de fidelidad por cada $100 de compra.
                    </>
                  )}
                </p>

                {!mostrarAlta ? (
                  <>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                      <input
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          buscar(e.target.value);
                        }}
                        placeholder="Buscar cliente por nombre o teléfono..."
                        className="w-full bg-surface-700 border border-surface-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:outline-none transition-all"
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
                          Sin resultados. Registra un nuevo cliente.
                        </p>
                      ) : (
                        clientes.map((c) => (
                          <button
                            key={c.idCliente}
                            onClick={() => elegirCliente(c)}
                            className="w-full flex items-center justify-between bg-surface-700 hover:bg-surface-600 rounded-xl px-4 py-3 transition-colors text-left"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-100 truncate">{c.nombre}</p>
                              <p className="text-xs text-muted">
                                {c.telefono ? `${c.telefono} · ` : ""}
                                {c.puntosFidelidad} pts
                                <span className="text-neon-purple font-bold">
                                  {" "}
                                  · {c.nivel}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span
                                className={cn(
                                  "text-xs font-bold",
                                  c.saldoDeudor > 0 ? "text-warning" : "text-neon-green"
                                )}
                              >
                                ${c.saldoDeudor.toFixed(2)}
                              </span>
                              <Check className="h-4 w-4 text-muted" />
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <button
                      onClick={() => setMostrarAlta(true)}
                      className={cn(
                        "mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-colors",
                        esMonedero
                          ? "bg-neon-yellow/10 border-neon-yellow/40 text-neon-yellow hover:bg-neon-yellow/20"
                          : "bg-neon-green/10 border-neon-green/40 text-neon-green hover:bg-neon-green/20"
                      )}
                    >
                      <Plus className="h-4 w-4" /> Registrar nuevo cliente
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => setMostrarAlta(false)}
                      className="flex items-center gap-1 text-xs text-muted hover:text-gray-100"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Volver a la búsqueda
                    </button>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Nombre completo *</span>
                      <input
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej. María López"
                        className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none transition-all"
                        autoFocus
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Teléfono (opcional)</span>
                      <input
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="Ej. 55 1234 5678"
                        className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none transition-all"
                      />
                    </label>

                    {error && (
                      <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                        {error}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        onClick={() => setMostrarAlta(false)}
                        className="py-3 rounded-xl bg-surface-700 text-muted text-sm font-bold hover:bg-surface-600 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={crearYSeleccionar}
                        disabled={guardando}
                        className={cn(
                          "flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all",
                          !guardando
                            ? "bg-neon-green text-btn-ink shadow-neon"
                            : "bg-surface-600 text-muted cursor-not-allowed"
                        )}
                      >
                        {guardando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>Registrar y continuar</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}