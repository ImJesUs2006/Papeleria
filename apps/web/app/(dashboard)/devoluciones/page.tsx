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
  Clock,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { ErrorBoundary } from "@/components/error-boundary";
import { AutorizacionModal } from "@/components/pos/descuentos-pago";
import { useAuthStore } from "@/store/auth";
import { useConfigStore } from "@/store/config";
import { notificar } from "@/store/notificaciones";
import { cn } from "@/lib/utils";

const MOTIVOS: Array<{ id: string; label: string }> = [
  { id: "DEFECTUOSO", label: "Defectuoso / no funciona" },
  { id: "EQUIVOCADO", label: "Se llevó otro / equivocado" },
  { id: "NO_LE_GUSTO", label: "No le gustó" },
  { id: "CADUCADO", label: "Caducado" },
  { id: "CAMBIO", label: "Cambio por otro producto" },
  { id: "OTRO", label: "Otro" },
];
const ETIQUETA_MOTIVO: Record<string, string> = Object.fromEntries(MOTIVOS.map((m) => [m.id, m.label]));

const DESTINOS = [
  { id: "INVENTARIO", label: "Regresa a la venta" },
  { id: "MERMA", label: "Merma (dañado)" },
  { id: "PROVEEDOR", label: "Se devuelve al proveedor" },
];

interface VentaReciente {
  folioVenta: string;
  fechaHora: string;
  totalNeto: number;
  cliente: string | null;
  cajero: string;
  articulos: number;
}

interface ResumenDevoluciones {
  numero: number;
  total: number;
  porMotivo: Array<{ motivo: string; veces: number }>;
  productos: Array<{ codigoItem: string; descripcion: string; cantidad: number }>;
}

interface VentaItem {
  codigoItem: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotalLinea: number;
  /** IVA + IEPS cobrados en la línea (para la vista previa del reembolso). */
  impuestosLinea?: number;
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
  motivoCategoria?: string | null;
  items: Array<{ descripcion: string; cantidad: number }>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const METODOS_REEMBOLSO = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA_TERMINAL", label: "Tarjeta (terminal)" },
  { value: "PUNTOS_MONEDERO", label: "Puntos de fidelidad" },
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
  const [motivoCategoria, setMotivoCategoria] = useState("");
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [ventasRecientes, setVentasRecientes] = useState<VentaReciente[]>([]);
  const [resumen, setResumen] = useState<ResumenDevoluciones | null>(null);
  const [pideAutorizacion, setPideAutorizacion] = useState<string | null>(null);
  const [errorAutorizacion, setErrorAutorizacion] = useState<string | null>(null);
  const rol = useAuthStore((s) => s.rol);
  const diasDevolucion = useConfigStore((s) => s.config?.diasDevolucion ?? 30);
  const montoAutorizar = useConfigStore((s) => s.config?.montoAutorizarDevolucion ?? null);

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [resultado, setResultado] = useState<null | {
    folioDevolucion: string;
    totalNeto: number;
    tipo: string;
    metodoReembolso: string;
    ventaCompleta: boolean;
    esCambio?: boolean;
  }>(null);

  const [recientes, setRecientes] = useState<DevolucionResumen[]>([]);
  const [loadingRecientes, setLoadingRecientes] = useState(true);

  const cargarRecientes = useCallback(async () => {
    setLoadingRecientes(true);
    try {
      const res = await fetch("/api/devoluciones");
      if (res.ok) {
        const d = await res.json();
        setRecientes(d.data ?? []);
        setResumen(d.resumen ?? null);
      }
    } finally {
      setLoadingRecientes(false);
    }
  }, []);

  useEffect(() => {
    cargarRecientes();
  }, [cargarRecientes]);

  // Tickets recientes (o búsqueda por folio / cliente) para elegir sin teclear.
  useEffect(() => {
    if (venta) return;
    const t = setTimeout(() => {
      fetch(`/api/ventas?q=${encodeURIComponent(folio.trim())}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => setVentasRecientes(d.data ?? []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [folio, venta]);

  const buscarVenta = async (folioElegido?: string) => {
    const f = (folioElegido ?? folio).trim();
    if (!f) return;
    setDestinos({});
    setMotivoCategoria("");
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
    // Proporcional a lo cobrado por línea (base e impuestos reales de la
    // venta); el servidor recalcula y es la autoridad.
    let subtotal = 0;
    let iva = 0;
    for (const item of venta.items) {
      const c = seleccion[item.codigoItem] ?? 0;
      if (c <= 0 || item.cantidad <= 0) continue;
      const proporcion = c / item.cantidad;
      subtotal = round2(subtotal + (item.subtotalLinea ?? item.precioUnitario * item.cantidad) * proporcion);
      iva = round2(iva + (item.impuestosLinea ?? 0) * proporcion);
    }
    return { subtotal, iva, total: round2(subtotal + iva), hay: subtotal > 0 };
  }, [venta, seleccion]);

  const enviar = async (autorizacion?: { username: string; password: string }) => {
    if (!venta || !totales.hay) return;
    if (!motivoCategoria) {
      setErrorEnvio("Elige el motivo de la devolución");
      return;
    }
    setEnviando(true);
    setErrorEnvio("");
    try {
      const items = venta.items
        .map((i) => ({
          codigoItem: i.codigoItem,
          cantidad: seleccion[i.codigoItem] ?? 0,
          destino: destinos[i.codigoItem] ?? "INVENTARIO",
        }))
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
          motivoCategoria,
          ...(autorizacion ? { autorizacion } : {}),
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.requiereAutorizacion) {
        // Fuera de plazo o monto alto: la administradora teclea su clave.
        if (autorizacion) setErrorAutorizacion(data.error);
        setPideAutorizacion(data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Error al registrar la devolución");
      setPideAutorizacion(null);
      setErrorAutorizacion(null);
      notificar.exito(
        `${data.tipo === "NOTA_CREDITO" ? "Nota de crédito" : "Devolución"} ${data.folioDevolucion}`,
        `Total $${Number(data.totalNeto).toFixed(2)}`
      );
      data.esCambio = motivoCategoria === "CAMBIO";

      setResultado(data);
      setVenta(null);
      setFolio("");
      setSeleccion({});
      setMotivo("");
      setMotivoCategoria("");
      setDestinos({});
      cargarRecientes();
    } catch (e: any) {
      setErrorEnvio(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h2 className="text-2xl font-black text-gray-100 mb-1">Devoluciones y notas de crédito</h2>
          <p className="text-sm text-muted">
            Devuelve total o parcialmente una venta, reingresa stock y reembolsa o genera nota de crédito
          </p>
        </motion.div>

        <ErrorBoundary label="el módulo de devoluciones">
          {resumen && resumen.numero > 0 && (
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tarjeta etiqueta="Devoluciones (30 días)" valor={String(resumen.numero)} />
              <Tarjeta etiqueta="Total devuelto (30 días)" valor={`$${resumen.total.toFixed(2)}`} />
              <Tarjeta
                etiqueta="Motivo más común"
                valor={ETIQUETA_MOTIVO[resumen.porMotivo[0]?.motivo] ?? "Sin registrar"}
                pequeño
              />
              <Tarjeta
                etiqueta="Producto más devuelto"
                valor={resumen.productos[0]?.descripcion ?? "—"}
                nota={resumen.productos[0] ? `${resumen.productos[0].cantidad} pzas` : undefined}
                pequeño
              />
            </div>
          )}

          {/* Búsqueda */}
          <div className="flex gap-3 mb-5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarVenta()}
                placeholder="Escanea el código del ticket, escribe el folio o el nombre del cliente"
                className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </div>
            <button
              onClick={() => buscarVenta()}
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

          {/* Tickets recientes para elegir */}
          {!venta && !resultado && ventasRecientes.length > 0 && (
            <div className="mb-6 rounded-2xl border border-surface-600 bg-surface-800">
              <p className="border-b border-surface-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted">
                {folio.trim() ? "Coincidencias" : "Ventas de los últimos 3 días"} · elige el ticket
              </p>
              <ul className="max-h-72 divide-y divide-surface-700 overflow-y-auto">
                {ventasRecientes.map((v) => (
                  <li key={v.folioVenta}>
                    <button
                      type="button"
                      onClick={() => {
                        setFolio(v.folioVenta);
                        buscarVenta(v.folioVenta);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-surface-700/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-100">
                          {v.folioVenta}
                          {v.cliente && <span className="font-normal text-muted"> · {v.cliente}</span>}
                        </p>
                        <p className="text-[11px] text-muted">
                          {new Date(v.fechaHora).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                          {v.articulos} artículo{v.articulos === 1 ? "" : "s"} · {v.cajero}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold tabular-nums text-gray-100">${v.totalNeto.toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
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
                  {(() => {
                    const dias = Math.floor((Date.now() - new Date(venta.fechaHora).getTime()) / 86_400_000);
                    const fuera = dias > diasDevolucion;
                    return (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold",
                          fuera ? "bg-amber-500/15 text-amber-300" : "bg-surface-700 text-muted"
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {dias === 0 ? "Hoy" : `Hace ${dias} día${dias === 1 ? "" : "s"}`}
                        {fuera && ` · fuera de plazo (${diasDevolucion} días)${rol !== "ADMINISTRADORA" ? ": pedirá autorización" : ""}`}
                      </span>
                    );
                  })()}
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
                      <th className="px-5 py-3 font-semibold">¿Qué pasa con él?</th>
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
                        <td className="px-5 py-3">
                          <select
                            value={destinos[item.codigoItem] ?? "INVENTARIO"}
                            disabled={!(seleccion[item.codigoItem] > 0)}
                            onChange={(e) => setDestinos({ ...destinos, [item.codigoItem]: e.target.value })}
                            className="input-dark py-1.5 text-xs disabled:opacity-40"
                            aria-label={`Destino de ${item.descripcion}`}
                          >
                            {DESTINOS.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.label}
                              </option>
                            ))}
                          </select>
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

                    <div>
                      <span className="text-xs text-muted mb-2 block">Motivo *</span>
                      <div className="flex flex-wrap gap-1.5">
                        {MOTIVOS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setMotivoCategoria(m.id)}
                            aria-pressed={motivoCategoria === m.id}
                            className={cn(
                              "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                              motivoCategoria === m.id
                                ? "border-acento bg-acento/10 text-acento"
                                : "border-surface-500 text-muted hover:text-gray-100"
                            )}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Detalle (opcional)</span>
                      <input
                        value={motivo}
                        maxLength={300}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Ej: la tapa venía rota"
                        className="input-dark"
                      />
                    </label>
                    {motivoCategoria === "CAMBIO" && (
                      <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-[11px] text-sky-300">
                        Cambio: registra aquí la devolución y luego cobra el producto nuevo en Cobro. En efectivo solo
                        entregas o recibes la diferencia.
                      </p>
                    )}
                    {montoAutorizar != null && rol !== "ADMINISTRADORA" && totales.total >= montoAutorizar && (
                      <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                        Desde ${montoAutorizar.toFixed(2)} se necesita la clave de la administradora.
                      </p>
                    )}
                  </div>

                  <div className="bg-surface-900/50 rounded-xl p-4 flex flex-col">
                    <p className="text-xs text-muted mb-2">Resumen de la devolución</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-muted">
                        <span>Subtotal</span>
                        <span>${totales.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span>Impuestos</span>
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
                      onClick={() => enviar()}
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
              {resultado.esCambio && (
                <Link
                  href="/cobro"
                  className="ml-auto flex shrink-0 items-center gap-2 rounded-xl bg-acento px-4 py-2 text-sm font-bold text-btn-ink"
                >
                  <ShoppingCart className="h-4 w-4" /> Cobrar el producto nuevo
                </Link>
              )}
            </div>
          )}

          <AutorizacionModal
            open={pideAutorizacion !== null}
            mensaje={pideAutorizacion ?? ""}
            error={errorAutorizacion}
            enviando={enviando}
            onClose={() => {
              setPideAutorizacion(null);
              setErrorAutorizacion(null);
            }}
            onAutorizar={(cred) => enviar(cred)}
          />

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
                        <td className="px-5 py-3 text-muted">
                          {d.metodoReembolso}
                          {d.motivoCategoria && (
                            <span className="block text-[10px]">{ETIQUETA_MOTIVO[d.motivoCategoria] ?? d.motivoCategoria}</span>
                          )}
                        </td>
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
    </>
  );
}

function Tarjeta({ etiqueta, valor, nota, pequeño }: { etiqueta: string; valor: string; nota?: string; pequeño?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-surface-600 bg-surface-800 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{etiqueta}</p>
      <p className={cn("mt-1 truncate font-black text-gray-100", pequeño ? "text-sm" : "text-2xl tabular-nums")} title={valor}>
        {valor}
      </p>
      {nota && <p className="text-[11px] text-muted">{nota}</p>}
    </div>
  );
}
