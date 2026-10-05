"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Plus,
  Coins,
  History,
  Pencil,
  Trash2,
  UserX,
  Phone,
  ShoppingBag,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { VirtualCard } from "@/components/pos/virtual-card";
import { Skeleton } from "@/components/ui/skeleton";

interface ClienteFila {
  idCliente: string;
  nombre: string;
  telefono: string | null;
  saldoDeudor: number;
  puntosFidelidad: number;
  nivel: "MENUDEO" | "MAYOREO";
  montoHistorico: number;
  /** Fase 12: datos fiscales (requeridos para poder facturar). */
  rfc?: string | null;
  razonSocial?: string | null;
}

interface VentaHistorial {
  folioVenta: string;
  fechaHora: string;
  totalNeto: number;
  metodoPago: string;
  estado: string;
  devoluciones: number;
}

interface ClienteDetalle extends ClienteFila {
  equivalenciaPesos: number;
  totalVentas: number;
}

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  TARJETA_TERMINAL: "Tarjeta",
  DIGITAL: "Transferencia",
  TRANSFERENCIA: "Transferencia",
  PUNTOS_MONEDERO: "Puntos",
};

/** Formato monetario seguro: nunca revienta con undefined/null/NaN. */
const money = (v: unknown): string => `$${(Number(v) || 0).toFixed(2)}`;

export default function ClientesPage() {
  const [clientes, setClientes] = useState<ClienteFila[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selId, setSelId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null);
  const [historial, setHistorial] = useState<VentaHistorial[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // Formulario (alta / edición)
  const [formAbierto, setFormAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  // Fase 12: datos fiscales del cliente (necesarios para emitir CFDI).
  const [rfc, setRfc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const cargarLista = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clientes?q=${encodeURIComponent(q)}&limit=100`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("No se pudo cargar el padrón de clientes");
      const data = await res.json();
      setClientes(Array.isArray(data.clientes) ? data.clientes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
      setClientes([]);
    } finally {
      setCargando(false);
    }
  }, [q]);

  useEffect(() => {
    // Debounce ligero para no golpear el endpoint en cada tecla.
    const t = setTimeout(() => {
      void cargarLista();
    }, 250);
    return () => clearTimeout(t);
  }, [cargarLista]);

  const cargarDetalle = useCallback(async (id: string) => {
    setCargandoDetalle(true);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("No se pudo cargar la ficha del cliente");
      const data = await res.json();
      setDetalle(data.cliente ?? null);
      setHistorial(Array.isArray(data.ventas) ? data.ventas : []);
    } catch (e) {
      setDetalle(null);
      setHistorial([]);
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const seleccionar = (id: string) => {
    setSelId(id);
    void cargarDetalle(id);
  };

  const abrirAlta = () => {
    setEditandoId(null);
    setNombre("");
    setTelefono("");
    setRfc("");
    setRazonSocial("");
    setFormError(null);
    setFormAbierto(true);
  };

  const abrirEdicion = (c: ClienteFila) => {
    setEditandoId(c.idCliente);
    setNombre(c.nombre);
    setTelefono(c.telefono ?? "");
    setRfc(c.rfc ?? "");
    setRazonSocial(c.razonSocial ?? "");
    setFormError(null);
    setFormAbierto(true);
  };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setFormError(null);
    try {
      const esEdicion = editandoId !== null;
      const res = await fetch(
        esEdicion ? `/api/clientes/${encodeURIComponent(editandoId)}` : "/api/clientes",
        {
          method: esEdicion ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // `.strict()` en el servidor: solo estos campos.
          body: JSON.stringify({
            nombre,
            telefono: telefono || null,
            rfc: rfc.trim().toUpperCase() || null,
            razonSocial: razonSocial.trim() || null,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo guardar el cliente");
      }
      setFormAbierto(false);
      await cargarLista();
      if (esEdicion && editandoId) void cargarDetalle(editandoId);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (c: ClienteFila) => {
    if (guardando) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`¿Eliminar a ${c.nombre}? Esta acción no se puede deshacer.`)
    ) {
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(c.idCliente)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "No se pudo eliminar");
      if (selId === c.idCliente) {
        setSelId(null);
        setDetalle(null);
        setHistorial([]);
      }
      await cargarLista();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-4">
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex flex-wrap items-end justify-between gap-3"
        >
          <div>
            <h2 className="text-2xl font-black text-gray-100">Clientes</h2>
            <p className="text-sm text-muted">
              Padrón, monedero de puntos, tarjeta de fidelidad e historial de compras.
            </p>
          </div>
          <button
            onClick={abrirAlta}
            className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink shadow-card hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nuevo cliente
          </button>
        </motion.div>

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full rounded-xl border border-surface-500 bg-surface-700 py-2.5 pl-10 pr-4 text-sm text-gray-100 outline-none focus:border-acento"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Listado */}
          <div className="space-y-2 lg:col-span-2">
            {cargando ? (
              <Skeleton className="h-64 w-full" />
            ) : clientes.length === 0 ? (
              <p className="rounded-xl border border-surface-600 bg-surface-800 px-4 py-6 text-center text-sm text-muted">
                {q
                  ? "Sin resultados para la búsqueda."
                  : "Aún no hay clientes registrados."}
              </p>
            ) : (
              clientes.map((c) => (
                <div
                  key={c.idCliente}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    selId === c.idCliente
                      ? "border-acento/60 bg-surface-600"
                      : "border-surface-600 bg-surface-700 hover:bg-surface-600"
                  }`}
                >
                  <button
                    onClick={() => seleccionar(c.idCliente)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-bold text-gray-100">
                      {c.nombre}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.telefono || "Sin teléfono"}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-bold ${
                          c.nivel === "MAYOREO"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-surface-600 text-slate-300"
                        }`}
                      >
                        {c.nivel}
                      </span>
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <Coins className="h-3 w-3" />
                        {Number(c.puntosFidelidad) || 0} pts
                      </span>
                      <span>Histórico: {money(c.montoHistorico)}</span>
                      {Number(c.saldoDeudor) > 0 && (
                        <span className="text-rose-300">
                          Saldo a cobrar: {money(c.saldoDeudor)}
                        </span>
                      )}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => abrirEdicion(c)}
                      title="Editar"
                      className="rounded-lg border border-surface-500 p-2 text-slate-300 hover:bg-surface-600 hover:text-gray-100"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => eliminar(c)}
                      title="Eliminar"
                      className="rounded-lg border border-rose-500/40 p-2 text-rose-300 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Ficha */}
          <div className="space-y-3">
            {!selId && !cargandoDetalle && (
              <div className="rounded-xl border border-dashed border-surface-600 bg-surface-800 px-4 py-8 text-center text-sm text-muted">
                Selecciona un cliente para ver su tarjeta y su historial.
              </div>
            )}

            {cargandoDetalle && <Skeleton className="h-64 w-full" />}

            {detalle && !cargandoDetalle && (
              <>
                <VirtualCard
                  nombre={detalle.nombre}
                  nivel={detalle.nivel}
                  puntos={Number(detalle.puntosFidelidad) || 0}
                  valorPuntoPesos={1}
                />

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-surface-600 bg-surface-800 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Compras
                    </p>
                    <p className="text-sm font-black text-gray-100">
                      {Number(detalle.totalVentas) || 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-surface-600 bg-surface-800 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Histórico
                    </p>
                    <p className="text-sm font-black text-emerald-300">
                      {money(detalle.montoHistorico)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-surface-600 bg-surface-800 px-3 py-2 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-muted">
                      Puntos
                    </p>
                    <p className="text-sm font-black text-amber-300">
                      {money(detalle.equivalenciaPesos)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-surface-600 bg-surface-800 p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-muted">
                    <History className="h-3.5 w-3.5" /> Historial de compras
                  </h4>
                  {historial.length === 0 ? (
                    <p className="text-xs text-muted">
                      Este cliente todavía no tiene compras registradas.
                    </p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-auto">
                      {historial.map((v) => (
                        <div
                          key={v.folioVenta}
                          className="flex items-center justify-between gap-2 rounded-lg bg-surface-700 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-gray-100">
                              {v.folioVenta}
                            </p>
                            <p className="text-[11px] text-muted">
                              {new Date(v.fechaHora).toLocaleString("es-MX")}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-xs font-bold text-emerald-300">
                              {money(v.totalNeto)}
                            </p>
                            <p className="text-[11px] text-muted">
                              {METODO_LABEL[v.metodoPago] ?? v.metodoPago}
                              {v.estado !== "COMPLETADA" ? ` · ${v.estado}` : ""}
                              {v.devoluciones > 0 ? ` · ${v.devoluciones} dev.` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modal alta / edición */}
        {formAbierto && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => !guardando && setFormAbierto(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-surface-600 bg-surface-800 p-5 shadow-card"
            >
              <div className="mb-4 flex items-center gap-2">
                {editandoId ? (
                  <Pencil className="h-4 w-4 text-acento" />
                ) : (
                  <UserX className="h-4 w-4 text-acento" />
                )}
                <h3 className="text-lg font-black text-gray-100">
                  {editandoId ? "Editar cliente" : "Nuevo cliente"}
                </h3>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">
                    Nombre completo *
                  </span>
                  <input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={80}
                    placeholder="Ej. María López"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">
                    Teléfono
                  </span>
                  <input
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    maxLength={20}
                    placeholder="55 1234 5678"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                </label>
              </div>

              {/* Fase 12: datos fiscales para la facturación (opcionales). */}
              <p className="mt-3 text-xs text-muted">
                Datos fiscales (opcionales; obligatorios solo para facturar)
              </p>
              <div className="mt-1 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">
                    RFC
                  </span>
                  <input
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    maxLength={13}
                    placeholder="GACM8401018P4"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-muted">
                    Razón social
                  </span>
                  <input
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    maxLength={120}
                    placeholder="Solo persona moral"
                    className="w-full rounded-xl border border-surface-500 bg-surface-700 px-3 py-2 text-sm text-gray-100 outline-none focus:border-acento"
                  />
                </label>
              </div>

              {formError && (
                <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {formError}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setFormAbierto(false)}
                  disabled={guardando}
                  className="rounded-xl border border-surface-500 px-4 py-2 text-sm font-bold text-slate-300 hover:bg-surface-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={guardando || nombre.trim().length < 2}
                  className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2 text-sm font-bold text-btn-ink shadow-card hover:opacity-90 disabled:opacity-40"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}