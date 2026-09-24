"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays,
  List,
  Plus,
  ChevronLeft,
  ChevronRight,
  Truck,
  Loader2,
  X,
  PackagePlus,
  Search,
  CheckCircle2,
  XCircle,
  Navigation,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { cn } from "@/lib/utils";

interface PedidoItem {
  idItemPedido: string;
  codigoItem: string;
  descripcion: string;
  cantidad: number;
  precioCotizado: number;
}

interface Pedido {
  idPedido: string;
  proveedor: string;
  fechaPedido: string;
  fechaEntrega: string | null;
  totalEstimado: number;
  estado: "PENDIENTE" | "ENTREGADO" | "CANCELADO" | "EN_RUTA";
  notas: string | null;
  items: PedidoItem[];
  totalItems: number;
}

interface Proveedor {
  idProveedor: string;
  nombre: string;
}

interface ItemParaAgregar {
  codigoItem: string;
  descripcion: string;
  cantidad: number;
  precioCotizado: number;
}

const ESTADO_STYLE: Record<string, string> = {
  PENDIENTE: "text-neon-green border-neon-green/40 bg-neon-green/10",
  EN_RUTA: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10",
  ENTREGADO: "text-gray-300 border-surface-500 bg-surface-600/40",
  CANCELADO: "text-neon-red border-neon-red/40 bg-neon-red/10",
};

function difDias(fecha: Date): number {
  const hoy = new Date();
  const startHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const startF = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  return Math.round((startF.getTime() - startHoy.getTime()) / 86400000);
}

function colorEntrega(p: Pedido): string {
  if (p.estado === "ENTREGADO" || p.estado === "CANCELADO") return "bg-surface-500";
  if (!p.fechaEntrega) return "bg-neon-yellow";
  const d = difDias(new Date(p.fechaEntrega));
  if (d < 0) return "bg-neon-red";
  if (d <= 3) return "bg-neon-yellow";
  return "bg-neon-green";
}

function buildMonth(año: number, mes: number): (Date | null)[] {
  const first = new Date(año, mes, 1);
  const startDow = (first.getDay() + 6) % 7;
  const dias = new Date(año, mes + 1, 0).getDate();
  const celdas: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) celdas.push(null);
  for (let d = 1; d <= dias; d++) celdas.push(new Date(año, mes, d));
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState<"calendario" | "lista">("calendario");
  const [mesActual, setMesActual] = useState(() => new Date().getMonth());
  const [añoActual, setAñoActual] = useState(() => new Date().getFullYear());
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  // Formulario de creación
  const [fProveedor, setFProveedor] = useState("");
  const [fFecha, setFFecha] = useState("");
  const [fEstado, setFEstado] = useState<"PENDIENTE" | "EN_RUTA">("PENDIENTE");
  const [fNotas, setFNotas] = useState("");
  const [items, setItems] = useState<ItemParaAgregar[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pedidos");
      if (!res.ok) throw new Error("error");
      setPedidos((await res.json()).data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    fetch("/api/proveedores?activos=true")
      .then((r) => r.json())
      .then((d) => setProveedores(d.data ?? []))
      .catch(() => {});
  }, [cargar]);

  useEffect(() => {
    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/productos?q=${encodeURIComponent(busqueda)}&limit=12`);
        const d = await res.json();
        setResultados(
          (d.data ?? []).filter((p: any) => !items.some((i) => i.codigoItem === p.codigoItem))
        );
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, items]);

  const celdas = useMemo(() => buildMonth(añoActual, mesActual), [añoActual, mesActual]);
  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const pedidosPorDia = useMemo(() => {
    const map = new Map<string, Pedido[]>();
    for (const p of pedidos) {
      if (!p.fechaEntrega) continue;
      const d = new Date(p.fechaEntrega);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [pedidos]);

  const agregarProducto = (p: any) => {
    setItems((prev) => [
      ...prev,
      { codigoItem: p.codigoItem, descripcion: p.descripcion, cantidad: 1, precioCotizado: Number(p.precioUnitario) },
    ]);
    setBusqueda("");
    setResultados([]);
  };

  const crearPedido = async () => {
    if (!fProveedor) return setError("Selecciona un proveedor");
    if (items.length === 0) return setError("Agrega al menos un producto");
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idProveedor: fProveedor,
          fechaEntrega: fFecha || null,
          estado: fEstado,
          notas: fNotas || null,
          items: items.map((i) => ({ codigoItem: i.codigoItem, cantidad: i.cantidad, precioCotizado: i.precioCotizado })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Error al crear pedido");
      } else {
        setModal(false);
        setItems([]);
        setFProveedor("");
        setFFecha("");
        setFNotas("");
        cargar();
      }
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (id: string, estado: string) => {
    const res = await fetch(`/api/pedidos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    if (res.ok) cargar();
  };

  const totalEstimado = items.reduce((a, i) => a + i.cantidad * i.precioCotizado, 0);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-100 mb-1">Pedidos a Proveedores</h2>
            <p className="text-sm text-muted">Calendario de entregas estimadas y control de la cadena de suministro</p>
          </div>
          <div className="flex gap-2">
            <div className="flex bg-surface-800 p-1 rounded-xl">
              <button
                onClick={() => setVista("calendario")}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all", vista === "calendario" ? "bg-surface-600 text-gray-100" : "text-muted hover:text-gray-100")}
              >
                <CalendarDays className="h-4 w-4" /> Calendario
              </button>
              <button
                onClick={() => setVista("lista")}
                className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all", vista === "lista" ? "bg-surface-600 text-gray-100" : "text-muted hover:text-gray-100")}
              >
                <List className="h-4 w-4" /> Lista
              </button>
            </div>
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => setModal(true)} className="btn-magenta flex items-center gap-2 py-2.5 px-5 text-sm">
              <Plus className="h-4 w-4" /> Nuevo pedido
            </motion.button>
          </div>
        </motion.div>

        {/* Leyenda */}
        <div className="flex items-center gap-5 text-xs text-muted mb-4 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-neon-green inline-block" /> Entrega lejana (verde)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-neon-yellow inline-block" /> Próxima ≤3 días (amarillo)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-neon-red inline-block" /> Vencida (rojo)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-surface-500 inline-block" /> Entregada/cancelada</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando pedidos...
          </div>
        ) : vista === "calendario" ? (
          <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-neon-cyan" />
                <span className="font-bold text-gray-100">{MESES[mesActual]} {añoActual}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { if (mesActual === 0) { setMesActual(11); setAñoActual((a) => a - 1); } else setMesActual((m) => m - 1); }} className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button onClick={() => { const hoy = new Date(); setMesActual(hoy.getMonth()); setAñoActual(hoy.getFullYear()); }} className="px-3 py-1.5 rounded-lg bg-surface-700 text-xs text-gray-200 hover:bg-surface-600">
                  Hoy
                </button>
                <button onClick={() => { if (mesActual === 11) { setMesActual(0); setAñoActual((a) => a + 1); } else setMesActual((m) => m + 1); }} className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-surface-600">
              {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map((d) => (
                <div key={d} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {celdas.map((fecha, i) => {
                if (!fecha) return <div key={i} className="min-h-[90px] border-r border-b border-surface-700 bg-surface-900/40" />;
                const key = `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
                const dia = pedidosPorDia.get(key) ?? [];
                const esHoy = new Date().toDateString() === fecha.toDateString();
                return (
                  <div key={i} className={cn("min-h-[90px] p-2 border-r border-b border-surface-700", esHoy && "bg-neon-green/5")}>
                    <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold", esHoy ? "bg-neon-green text-btn-ink" : "text-muted")}>
                      {fecha.getDate()}
                    </span>
                    <div className="mt-1 space-y-1">
                      {dia.slice(0, 3).map((p) => (
                        <div key={p.idPedido} className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-100 truncate", colorEntrega(p))}>
                          <span className="truncate">{p.proveedor.split(" ")[0]} ${p.totalEstimado.toFixed(0)}</span>
                        </div>
                      ))}
                      {dia.length > 3 && <p className="text-[9px] text-muted pl-1">+{dia.length - 3} más</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-600">
              <List className="h-5 w-5 text-neon-cyan" />
              <span className="font-bold text-gray-100">Lista de pedidos ({pedidos.length})</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-surface-600 bg-surface-700/40">
                    <th className="px-5 py-3 font-semibold">Proveedor</th>
                    <th className="px-5 py-3 font-semibold">Entrega estimada</th>
                    <th className="px-5 py-3 font-semibold">Total</th>
                    <th className="px-5 py-3 font-semibold">Estado</th>
                    <th className="px-5 py-3 font-semibold">Productos</th>
                    <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p.idPedido} className="border-b border-surface-700 last:border-0 hover:bg-surface-700/40 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-100">{p.proveedor}</td>
                      <td className="px-5 py-3">
                        {p.fechaEntrega ? (
                          <span className={cn("text-xs font-bold", difDias(new Date(p.fechaEntrega)) < 0 && p.estado !== "ENTREGADO" && p.estado !== "CANCELADO" ? "text-neon-red" : "text-gray-300")}>
                            {new Date(p.fechaEntrega).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">Sin fecha</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-neon-cyan font-bold">${p.totalEstimado.toFixed(2)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border", ESTADO_STYLE[p.estado])}>
                          {p.estado}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted">{p.totalItems} artículos</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.estado === "PENDIENTE" && (
                            <button onClick={() => cambiarEstado(p.idPedido, "EN_RUTA")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-bold hover:bg-neon-cyan/20">
                              <Navigation className="h-3 w-3" /> En ruta
                            </button>
                          )}
                          {(p.estado === "PENDIENTE" || p.estado === "EN_RUTA") && (
                            <>
                              <button onClick={() => cambiarEstado(p.idPedido, "ENTREGADO")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neon-green/10 border border-neon-green/30 text-neon-green text-xs font-bold hover:bg-neon-green/20">
                                <CheckCircle2 className="h-3 w-3" /> Recibido
                              </button>
                              <button onClick={() => cambiarEstado(p.idPedido, "CANCELADO")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neon-red/10 border border-neon-red/30 text-neon-red text-xs font-bold hover:bg-neon-red/20">
                                <XCircle className="h-3 w-3" /> Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {pedidos.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-muted text-sm">Sin pedidos registrados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal nuevo pedido */}
        <AnimatePresence>
          {modal && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setModal(false)}>
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} onClick={(e) => e.stopPropagation()} className="bg-surface-800 border border-surface-600 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-neon-magenta/10 flex items-center justify-center"><Truck className="h-5 w-5 text-neon-magenta" /></div>
                    <h3 className="font-bold text-gray-100 text-lg">Nuevo pedido</h3>
                  </div>
                  <button onClick={() => setModal(false)} className="h-9 w-9 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100"><X className="h-4 w-4" /></button>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Proveedor *</span>
                    <select value={fProveedor} onChange={(e) => setFProveedor(e.target.value)} className="input-dark">
                      <option value="">Seleccionar...</option>
                      {proveedores.map((p) => (<option key={p.idProveedor} value={p.idProveedor}>{p.nombre}</option>))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted mb-1 block">Fecha de entrega estimada</span>
                    <input type="date" value={fFecha} onChange={(e) => setFFecha(e.target.value)} className="input-dark" />
                  </label>
                </div>

                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs text-muted">Estado inicial:</span>
                  <button onClick={() => setFEstado("PENDIENTE")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-all", fEstado === "PENDIENTE" ? "text-neon-green border-neon-green/40 bg-neon-green/10" : "text-muted border-surface-500")}>PENDIENTE</button>
                  <button onClick={() => setFEstado("EN_RUTA")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-all", fEstado === "EN_RUTA" ? "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10" : "text-muted border-surface-500")}>EN RUTA</button>
                  <div className="ml-auto text-xs text-muted">Total estimado: <span className="text-neon-cyan font-black text-sm">${totalEstimado.toFixed(2)}</span></div>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <PackagePlus className="h-4 w-4 text-neon-green" />
                    <span className="text-sm font-bold text-gray-100">Productos del pedido</span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                    <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto para agregar..." className="w-full bg-surface-700 border border-surface-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:outline-none" />
                  </div>
                  {buscando && busqueda.trim() && <p className="text-[11px] text-muted mt-2"><Loader2 className="h-3 w-3 inline animate-spin mr-1" />Buscando...</p>}
                  {resultados.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {resultados.map((r) => (
                        <button key={r.codigoItem} onClick={() => agregarProducto(r)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface-700 hover:bg-neon-green/10 text-left transition-colors">
                          <span className="text-sm text-gray-200">{r.descripcion}</span>
                          <span className="text-xs text-neon-cyan font-bold whitespace-nowrap ml-3">${Number(r.precioUnitario).toFixed(2)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {items.length > 0 && (
                  <div className="bg-surface-900 rounded-xl border border-surface-600 overflow-hidden mb-4">
                    <table className="w-full text-sm">
                      <thead><tr className="text-[10px] uppercase tracking-wider text-muted border-b border-surface-600"><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 w-20">Cantidad</th><th className="px-3 py-2 w-28">Precio cotizado</th><th className="px-3 py-2 w-24 text-right">Subtotal</th><th className="w-10"></th></tr></thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.codigoItem} className="border-b border-surface-700 last:border-0">
                            <td className="px-3 py-2 text-gray-200 text-xs">{it.descripcion}</td>
                            <td className="px-3 py-2"><input type="number" min={1} value={it.cantidad} onChange={(e) => setItems((prev) => prev.map((x) => x.codigoItem === it.codigoItem ? { ...x, cantidad: Math.max(1, Math.round(Number(e.target.value))) } : x))} className="w-full bg-surface-700 border border-surface-500 rounded px-2 py-1 text-sm text-gray-100" /></td>
                            <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={it.precioCotizado} onChange={(e) => setItems((prev) => prev.map((x) => x.codigoItem === it.codigoItem ? { ...x, precioCotizado: Number(e.target.value) } : x))} className="w-full bg-surface-700 border border-surface-500 rounded px-2 py-1 text-sm text-neon-cyan font-bold" /></td>
                            <td className="px-3 py-2 text-right text-neon-green font-bold text-xs">${(it.cantidad * it.precioCotizado).toFixed(2)}</td>
                            <td className="px-2 py-2"><button onClick={() => setItems((prev) => prev.filter((x) => x.codigoItem !== it.codigoItem))} className="text-muted hover:text-neon-red"><X className="h-4 w-4" /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <label className="block mb-4">
                  <span className="text-xs text-muted mb-1 block">Notas</span>
                  <input value={fNotas} onChange={(e) => setFNotas(e.target.value)} className="input-dark" placeholder="Instrucciones de entrega, notas internas..." />
                </label>

                {error && <div className="text-xs text-neon-red bg-neon-red/10 border border-neon-red/40 rounded-lg px-3 py-2 mb-4">{error}</div>}

                <div className="flex gap-3">
                  <button onClick={() => setModal(false)} className="btn-ghost flex-1">Cancelar</button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={crearPedido} disabled={guardando} className="btn-magenta flex-1 flex items-center justify-center gap-2">
                    {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                    Crear pedido
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}