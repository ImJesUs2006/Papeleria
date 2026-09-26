"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Check,
  Receipt,
  FileText,
  Banknote,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { cn } from "@/lib/utils";

interface VentaItem {
  codigoItem: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotalLinea: number;
  devuelto: number;
  disponible: number;
}

interface Venta {
  folioVenta: string;
  fechaHora: string;
  estado: string;
  metodoPago: string;
  subtotal: number;
  iva: number;
  totalNeto: number;
  items: VentaItem[];
  devoluciones: Array<{
    folioDevolucion: string;
    fechaHora: string;
    tipo: string;
    metodoReembolso: string;
    totalNeto: number;
  }>;
}

interface DevolucionResumen {
  folioDevolucion: string;
  folioVenta: string;
  fechaHora: string;
  tipo: string;
  metodoReembolso: string;
  totalNeto: number;
  usuario: string;
  items: Array<{ descripcion: string; cantidad: number }>;
}

const IVA_RATE = 0.16;
const round2 = (n: number) => Math.round(n * 100) / 100;

const METODOS_REEMBOLSO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA_TERMINAL", label: "Tarjeta (terminal)" },
];

export default function DevolucionesPage() {
  const [folio, setFolio] = useState("");
  const [venta, setVenta] = useState<Venta | null>(null);
  const [loadingVenta, setLoadingVenta] = useState(false);
  const [errorVenta, setErrorVenta] = useState("");

  const [seleccion, setSeleccion] = useState<Record<string, number>>({});
  const [tipo, setTipo] = useState<"DEVOLUCION" | "NOTA_CREDITO">("DEVOLUCION");
  const [metodo, setMetodo] = useState("EFECTIVO");
  const [motivo, setMotivo] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [resultado, setResultado] = useState<null | {
    folioDevolucion: string;
    totalNeto: number;
    tipo: string;
    metodoReembolso: string;
    ventaCompleta: boolean;
  }>(null);

  const [recientes, setRecientes] = useState<DevolucionResumen[]>([]);
  const [loadingRecientes, setLoadingRecientes] = useState(true);

  const cargarRecientes = useCallback(async () => {
    setLoadingRecientes(true);
    try {
      const res = await fetch("/api/devoluciones");
      if (res.ok) setRecientes((await res.json()).data ?? []);
    } finally {
      setLoadingRecientes(false);
    }
  }, []);

  useEffect(() => {
    cargarRecientes();
  }, [cargarRecientes]);

  const buscarVenta = async () => {
    const f = folio.trim();
    if (!f) return;
    setLoadingVenta(true);
    setErrorVenta("");
    setResultado(null);
    setVenta(null);
    setSeleccion({});
    try {
      const res = await fetch(`/api/ventas/${encodeURIComponent(f)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Venta no encontrada");
      setVenta(data);
    } catch (e: any) {
      setErrorVenta(e.message);
    } finally {
      setLoadingVenta(false);
    }
  };

  const setCantidad = (item: VentaItem, valor: number) => {
    const cantidad = Math.max(0, Math.min(item.disponible, Math.round(valor) || 0));
    setSeleccion((s) => ({ ...s, [item.codigoItem]: cantidad }));
  };

  const totales = useMemo(() => {
    if (!venta) return { subtotal: 0, iva: 0, total: 0, hay: false };
    let subtotal = 0;
    for (const item of venta.items) {
      const c = seleccion[item.codigoItem] ?? 0;
      if (c > 0) subtotal = round2(subtotal + item.precioUnitario * c);
    }
    const iva = round2(subtotal * IVA_RATE);
    return { subtotal, iva, total: round2(subtotal + iva), hay: subtotal > 0 };
  }, [venta, seleccion]);

  const enviar = async () => {
    if (!venta || !totales.hay) return;
    setEnviando(true);
    setErrorEnvio("");
    try {
      const items = venta.items
        .map((i) => ({ codigoItem: i.codigoItem, cantidad: seleccion[i.codigoItem] ?? 0 }))
        .filter((i) => i.cantidad > 0);

      const res = await fetch("/api/devoluciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folioVenta: venta.folioVenta,
          items,
          tipo,
          metodoReembolso: tipo === "NOTA_CREDITO" ? "NOTA_CREDITO" : metodo,
          motivo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al registrar la devolución");

      setResultado(data);
      setVenta(null);
      setFolio("");
      setSeleccion({});
      setMotivo("");
      cargarRecientes();
    } catch (e: any) {
      setErrorEnvio(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h2 className="text-2xl font-black text-gray-100 mb-1">Devoluciones y notas de crédito</h2>
          <p className="text-sm text-muted">
            Devuelve total o parcialmente una venta, reingresa stock y reembolsa o genera nota de crédito
          </p>
        </motion.div>

        <ErrorBoundary label="el módulo de devoluciones">
          {/* Búsqueda */}
          <div className="flex gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarVenta()}
                placeholder="Folio de venta (ej: F-20260916-A1B2)"
                className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </div>
            <button
              onClick={buscarVenta}
              disabled={loadingVenta}
              className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm"
            >
              {loadingVenta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar venta
            </button>
          </div>

          {errorVenta && (
            <div className="mb-5 flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-3 text-sm text-gray-100">
              <AlertTriangle className="h-4 w-4 text-neon-red" /> {errorVenta}
            </div>
          )}

          {/* Venta encontrada */}
          <AnimatePresence>
            {venta && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden mb-8"
              >
                <div className="flex flex-wrap items-center gap-4 px-5 py-4 border-b border-surface-600">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-neon-green/10 flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-neon-green" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-100">{venta.folioVenta}</p>
                      <p className="text-[11px] text-muted">
                        {new Date(venta.fechaHora).toLocaleString("es-MX")} · {venta.metodoPago}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-md bg-surface-700 text-gray-200">
                    {venta.estado}
                  </span>
                  <span className="ml-auto text-sm text-muted">
                    Total: <span className="text-gray-100 font-bold">${venta.totalNeto.toFixed(2)}</span>
                  </span>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-surface-600 bg-surface-700/40">
                      <th className="px-5 py-3 font-semibold">Producto</th>
                      <th className="px-5 py-3 font-semibold text-right">Vendido</th>
                      <th className="px-5 py-3 font-semibold text-right">Devuelto</th>
                      <th className="px-5 py-3 font-semibold text-right">Disponible</th>
                      <th className="px-5 py-3 font-semibold text-right">Precio</th>
                      <th className="px-5 py-3 font-semibold text-center w-28">Devolver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venta.items.map((item) => (
                      <tr key={item.codigoItem} className="border-b border-surface-700 last:border-0">
                        <td className="px-5 py-3">
                          <span className="text-gray-100">{item.descripcion}</span>
                          <span className="block text-[10px] text-muted">{item.codigoItem}</span>
                        </td>
                        <td className="px-5 py-3 text-right text-muted">{item.cantidad}</td>
                        <td className="px-5 py-3 text-right text-muted">{item.devuelto}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={cn("font-bold", item.disponible === 0 ? "text-muted" : "text-neon-green")}>
                            {item.disponible}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-200">${item.precioUnitario.toFixed(2)}</td>
                        <td className="px-5 py-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={item.disponible}
                            disabled={item.disponible === 0}
                            value={seleccion[item.codigoItem] ?? 0}
                            onChange={(e) => setCantidad(item, Number(e.target.value))}
                            className="w-20 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-center text-sm text-gray-100 focus:border-neon-green focus:outline-none disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 border-t border-surface-600">
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-muted mb-2 block">Tipo</span>
                      <div className="flex gap-2">
                        {(
                          [
                            { id: "DEVOLUCION", label: "Devolución (reembolso)", icon: Banknote },
                            { id: "NOTA_CREDITO", label: "Nota de crédito", icon: FileText },
                          ] as const
                        ).map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            onClick={() => setTipo(id)}
                            className={cn(
                              "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
                              tipo === id
                                ? "bg-neon-green/10 border-neon-green/40 text-gray-100"
                                : "bg-surface-700 border-surface-500 text-muted hover:text-gray-100"
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" /> {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {tipo === "DEVOLUCION" && (
                      <label className="block">
                        <span className="text-xs text-muted mb-1 block">Método de reembolso</span>
                        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="input-dark">
                          {METODOS_REEMBOLSO.map((m) => (
                            <option key={m.value} value={m.value}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Motivo (opcional)</span>
                      <input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Ej: producto defectuoso"
                        className="input-dark"
                      />
                    </label>
                  </div>

                  <div className="bg-surface-900/50 rounded-xl p-4 flex flex-col">
                    <p className="text-xs text-muted mb-2">Resumen de la devolución</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-muted">
                        <span>Subtotal</span>
                        <span>${totales.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>IVA (16%)</span>
                        <span>${totales.iva.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-gray-100 font-bold text-lg pt-1 border-t border-surface-600 mt-1">
                        <span>Total</span>
                        <span>${totales.total.toFixed(2)}</span>
                      </div>
                    </div>

                    {errorEnvio && (
                      <div className="mt-3 text-xs text-neon-red bg-neon-red/10 border border-neon-red/40 rounded-lg px-3 py-2">
                        {errorEnvio}
                      </div>
                    )}

                    <button
                      onClick={enviar}
                      disabled={!totales.hay || enviando}
                      className={cn(
                        "mt-4 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all",
                        totales.hay && !enviando
                          ? "bg-neon-green text-btn-ink shadow-neon"
                          : "bg-surface-600 text-muted cursor-not-allowed"
                      )}
                    >
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      {tipo === "NOTA_CREDITO" ? "Emitir nota de crédito" : "Registrar devolución"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {resultado && (
            <div className="mb-8 flex items-center gap-3 bg-neon-green/10 border border-neon-green/40 rounded-2xl px-5 py-4 text-sm text-gray-100">
              <Check className="h-5 w-5 text-neon-green" />
              <div>
                <p className="font-bold">
                  {resultado.tipo === "NOTA_CREDITO" ? "Nota de crédito" : "Devolución"}{" "}
                  {resultado.folioDevolucion} registrada por ${resultado.totalNeto.toFixed(2)}
                </p>
                <p className="text-xs text-muted">
                  {resultado.ventaCompleta
                    ? "La venta quedó marcada como REEMBOLSADA"
                    : "La venta sigue activa (devolución parcial)"}
                </p>
              </div>
            </div>
          )}

          {/* Historial */}
          <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-600">
              <RotateCcw className="h-5 w-5 text-neon-cyan" />
              <span className="font-bold text-gray-100">Devoluciones recientes</span>
            </div>
            {loadingRecientes ? (
              <div className="flex items-center justify-center py-12 text-muted gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
              </div>
            ) : recientes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted gap-2">
                <RotateCcw className="h-10 w-10 opacity-30" />
                <p className="text-sm">Sin devoluciones registradas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-surface-600 bg-surface-700/40">
                      <th className="px-5 py-3 font-semibold">Folio</th>
                      <th className="px-5 py-3 font-semibold">Venta</th>
                      <th className="px-5 py-3 font-semibold">Tipo</th>
                      <th className="px-5 py-3 font-semibold">Reembolso</th>
                      <th className="px-5 py-3 font-semibold text-right">Total</th>
                      <th className="px-5 py-3 font-semibold">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recientes.map((d) => (
                      <tr key={d.folioDevolucion} className="border-b border-surface-700 last:border-0">
                        <td className="px-5 py-3">
                          <span className="text-gray-100 font-medium">{d.folioDevolucion}</span>
                          <span className="block text-[10px] text-muted">
                            {new Date(d.fechaHora).toLocaleString("es-MX")}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">{d.folioVenta}</td>
                        <td className="px-5 py-3">
                          <span
                            className={cn(
                              "text-[11px] font-bold px-2 py-0.5 rounded-md",
                              d.tipo === "NOTA_CREDITO"
                                ? "bg-neon-blue/10 text-neon-blue"
                                : "bg-neon-yellow/10 text-warning"
                            )}
                          >
                            {d.tipo === "NOTA_CREDITO" ? "Nota de crédito" : "Devolución"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-muted">{d.metodoReembolso}</td>
                        <td className="px-5 py-3 text-right text-neon-green font-bold">
                          ${d.totalNeto.toFixed(2)}
                        </td>
                        <td className="px-5 py-3 text-muted">{d.usuario}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ErrorBoundary>
      </div>
    </DashboardLayout>
  );
}
