"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, Plus, Loader2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Cliente {
  idCliente: string;
  nombre: string;
  telefono: string | null;
  saldoDeudor: number;
  puntosFidelidad: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (cliente: { idCliente: string; nombre: string }) => void;
}

/** Modal de selección/alta de cliente para ventas a Crédito de Tienda. */
export function ClientSelectModal({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      buscar("");
    }
  }, [open, buscar]);

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
      onSelect({ idCliente: data.cliente.idCliente, nombre: data.cliente.nombre });
      onClose();
    } catch {
      setError("Error de conexión al registrar el cliente");
    } finally {
      setGuardando(false);
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
            initial={{ scale: 0.9, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-800 border border-surface-600 rounded-3xl p-6 max-w-lg w-full max-h-[85vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-neon-green" />
                <h3 className="font-black text-gray-100">Crédito de Tienda</h3>
              </div>
              <button onClick={onClose} className="text-muted hover:text-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-muted mb-4">
              La venta se cargará al saldo del cliente (no ingresa a caja) y suma 1 punto de
              fidelidad por cada $100 de compra.
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
                        onClick={() => {
                          onSelect({ idCliente: c.idCliente, nombre: c.nombre });
                          onClose();
                        }}
                        className="w-full flex items-center justify-between bg-surface-700 hover:bg-surface-600 rounded-xl px-4 py-3 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-100 truncate">{c.nombre}</p>
                          <p className="text-xs text-muted">
                            {c.telefono ? `${c.telefono} · ` : ""}
                            {c.puntosFidelidad} pts
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={cn("text-xs font-bold", c.saldoDeudor > 0 ? "text-neon-yellow" : "text-neon-green")}>
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
                  className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-neon-green/10 border border-neon-green/40 text-neon-green text-sm font-bold hover:bg-neon-green/20 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Registrar nuevo cliente
                </button>
              </>
            ) : (
              <div className="space-y-3">
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
                    Volver
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}