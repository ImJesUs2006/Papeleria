"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Barcode,
  Boxes,
  History,
  Info,
  Layers,
  Loader2,
  Package,
  Pencil,
  Store,
  X,
} from "lucide-react";
import { describirEscalas, type EscalaPrecio } from "@/lib/precios";
import { GeneradorVariantes } from "@/components/inventario/generador-variantes";
import { describirUnidadCompra } from "@/lib/unidades";
import { notificar } from "@/store/notificaciones";
import { cn } from "@/lib/utils";

interface Ficha {
  producto: {
    codigoItem: string;
    descripcion: string;
    imagenUrl: string | null;
    categoria: { nombre: string; color: string } | null;
    precioUnitario: number;
    precioMayoreo: number | null;
    escalasPrecio: EscalaPrecio[];
    costo: number | null;
    margenPorcentaje: number | null;
    stockTotal: number;
    stockMinimo: number;
    esServicio: boolean;
    usaLotes: boolean;
    usaSeries: boolean;
    codigoBarras: string | null;
    ubicacionEstante: string | null;
    grupoVariante: string | null;
    unidadCompra: string | null;
    piezasPorUnidad: number;
    unidadVenta: string | null;
  };
  existencias: Array<{ idSucursal: string; sucursal: string; esMatriz: boolean; stock: number; activa: boolean }>;
  lotes: Array<{ idLote: string; numeroLote: string; caducidad: string | null; cantidad: number; sucursal: string }>;
  series: {
    disponibles: number;
    vendidas: number;
    lista: Array<{ serie: string; estado: string; sucursal: string; folioVenta: string | null }>;
  };
  variantes: Array<{ codigoItem: string; descripcion: string; atributos: Record<string, string> | null; stock: number }>;
  ventas30: { unidades: number; importe: number; ultimaVenta: string | null; diasDeInventario: number | null };
}

interface Movimiento {
  idMovimiento: string;
  fecha: string;
  cantidadCambio: number;
  tipo: string;
  motivo: string | null;
  usuario: string;
}

type Pestana = "resumen" | "existencias" | "lotes" | "series" | "variantes" | "historial";

const dinero = (n: number) => `$${n.toFixed(2)}`;
const diasA = (fecha: string | null) =>
  fecha ? Math.round((new Date(fecha).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000) : null;

/**
 * Ficha del producto: todo lo suyo en un panel (precios, existencias por
 * sucursal, lotes, series, variantes e historial), con las acciones de
 * lotes y series aquí mismo para no cambiar de módulo.
 */
export function FichaProducto({
  codigo,
  onClose,
  onEditar,
  onCambio,
  pestanaInicial = "resumen",
}: {
  codigo: string | null;
  onClose: () => void;
  onEditar: (codigo: string) => void;
  onCambio?: () => void;
  /** Pestaña con la que abre (p. ej. "variantes" justo después de crear el modelo). */
  pestanaInicial?: Pestana;
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [cargando, setCargando] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("resumen");

  const cargar = useCallback(async () => {
    if (!codigo) return;
    setCargando(true);
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(codigo)}/ficha`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la ficha");
      setFicha(data);
    } catch (e: any) {
      notificar.error("No se pudo abrir la ficha", e.message);
      onClose();
    } finally {
      setCargando(false);
    }
  }, [codigo, onClose]);

  useEffect(() => {
    setFicha(null);
    setPestana(pestanaInicial);
    cargar();
  }, [cargar, pestanaInicial]);

  useEffect(() => {
    if (!codigo) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [codigo, onClose]);

  const recargar = () => {
    cargar();
    onCambio?.();
  };

  const p = ficha?.producto;
  const pestanas: Array<{ id: Pestana; label: string; icon: typeof Info; visible: boolean }> = [
    { id: "resumen", label: "Resumen", icon: Info, visible: true },
    { id: "existencias", label: "Existencias", icon: Store, visible: !p?.esServicio },
    { id: "lotes", label: "Lotes", icon: Boxes, visible: !!p?.usaLotes },
    { id: "series", label: "Series", icon: Barcode, visible: !!p?.usaSeries },
    // Un modelo (o un producto suelto) puede generar variantes; una variante ve a sus hermanas.
    { id: "variantes", label: "Variantes", icon: Layers, visible: !!p && !p.esServicio },
    { id: "historial", label: "Historial", icon: History, visible: !p?.esServicio },
  ];

  return (
    <AnimatePresence>
      {codigo && (
        <>
          <motion.div
            className="fixed inset-0 z-[55] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Ficha del producto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 z-[56] flex h-full w-[min(36rem,100vw)] flex-col border-l border-surface-600 bg-surface-800 shadow-card"
          >
            {/* Encabezado */}
            <div className="flex items-start gap-3 border-b border-surface-600 p-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-surface-500 bg-surface-700">
                {p?.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagenUrl} alt={p.descripcion} className="h-full w-full object-cover" />
                ) : (
                  <Package className="h-7 w-7 text-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-anywhere text-base font-black leading-snug text-gray-100">
                  {p?.descripcion ?? "Cargando…"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {codigo}
                  {p?.codigoBarras ? ` · ${p.codigoBarras}` : ""}
                  {p?.ubicacionEstante ? ` · Estante ${p.ubicacionEstante}` : ""}
                </p>
                {p?.categoria && (
                  <span
                    className="mt-1 inline-flex items-center gap-1 rounded-full border border-surface-500 px-2 py-0.5 text-[11px] font-semibold text-gray-200"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: p.categoria.color }} />
                    {p.categoria.nombre}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {p && (
                  <button
                    type="button"
                    onClick={() => onEditar(p.codigoItem)}
                    className="flex h-9 items-center gap-1.5 rounded-lg border border-acento/50 px-3 text-xs font-bold text-acento hover:bg-acento/10"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar ficha"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Pestañas */}
            <div className="flex gap-1 overflow-x-auto border-b border-surface-600 px-3 py-2">
              {pestanas
                .filter((t) => t.visible)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setPestana(t.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                      pestana === t.id ? "bg-surface-600 text-gray-100" : "text-muted hover:text-gray-100"
                    )}
                  >
                    <t.icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!ficha || cargando ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando ficha…
                </p>
              ) : pestana === "resumen" ? (
                <Resumen ficha={ficha} />
              ) : pestana === "existencias" ? (
                <Existencias ficha={ficha} />
              ) : pestana === "lotes" ? (
                <Lotes ficha={ficha} onCambio={recargar} />
              ) : pestana === "series" ? (
                <Series ficha={ficha} onCambio={recargar} />
              ) : pestana === "variantes" ? (
                <Variantes ficha={ficha} onCambio={recargar} />
              ) : (
                <Historial codigo={ficha.producto.codigoItem} />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Dato({ etiqueta, valor, nota, tono }: { etiqueta: string; valor: string; nota?: string; tono?: string }) {
  return (
    <div className="rounded-xl border border-surface-600 bg-surface-700/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{etiqueta}</p>
      <p className={cn("mt-0.5 text-lg font-black tabular-nums text-gray-100", tono)}>{valor}</p>
      {nota && <p className="text-[11px] text-muted">{nota}</p>}
    </div>
  );
}

function Resumen({ ficha }: { ficha: Ficha }) {
  const p = ficha.producto;
  const v = ficha.ventas30;
  const bajo = !p.esServicio && p.stockTotal <= p.stockMinimo;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Precio de venta" valor={dinero(p.precioUnitario)} nota={p.costo != null ? `Costo ${dinero(p.costo)}` : "Sin costo registrado"} />
        <Dato
          etiqueta="Margen"
          valor={p.margenPorcentaje != null ? `${p.margenPorcentaje}%` : "—"}
          tono={p.margenPorcentaje != null && p.margenPorcentaje < 10 ? "text-rose-300" : undefined}
          nota={p.margenPorcentaje != null && p.margenPorcentaje < 10 ? "Margen muy bajo" : undefined}
        />
        {!p.esServicio && (
          <Dato
            etiqueta="Existencia total"
            valor={String(p.stockTotal)}
            tono={bajo ? "text-amber-300" : undefined}
            nota={`Mínimo ${p.stockMinimo}${bajo ? " · por resurtir" : ""}`}
          />
        )}
        <Dato
          etiqueta="Vendido (30 días)"
          valor={String(v.unidades)}
          nota={
            v.diasDeInventario != null && !p.esServicio
              ? `Alcanza para ~${v.diasDeInventario} días`
              : v.ultimaVenta
                ? `Última: ${new Date(v.ultimaVenta).toLocaleDateString("es-MX")}`
                : "Sin ventas recientes"
          }
        />
      </div>
      <div className="rounded-xl border border-surface-600 p-3">
        <p className="mb-1 text-xs font-bold text-gray-100">Precios de mayoreo</p>
        {p.escalasPrecio.length > 0 ? (
          <p className="text-sm text-emerald-300">{describirEscalas(p.escalasPrecio)}</p>
        ) : (
          <p className="text-xs text-muted">Sin escalas. Agrégalas en “Editar” → Precios de mayoreo.</p>
        )}
      </div>
      {!p.esServicio && (
        <div className="rounded-xl border border-surface-600 p-3 text-xs text-muted">
          <p>
            Se compra por: <b className="text-gray-100">{describirUnidadCompra(p.unidadCompra, p.piezasPorUnidad)}</b>
            {p.piezasPorUnidad > 1 && p.costo != null && (
              <> · costo por {p.unidadCompra?.toLowerCase()} {dinero(p.costo * p.piezasPorUnidad)}</>
            )}
          </p>
          {p.unidadVenta && (
            <p className="mt-1">
              Se vende a granel por <b className="text-gray-100">{p.unidadVenta}</b>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Existencias({ ficha }: { ficha: Ficha }) {
  if (ficha.existencias.length === 0) {
    return <p className="text-sm text-muted">Sin existencias registradas en sucursales.</p>;
  }
  return (
    <ul className="space-y-2">
      {ficha.existencias.map((e) => (
        <li key={e.idSucursal} className="flex items-center justify-between rounded-xl border border-surface-600 px-3 py-2">
          <span className="text-sm text-gray-100">
            {e.sucursal}
            {e.esMatriz && <span className="ml-1 text-[11px] text-muted">(matriz)</span>}
            {e.activa && <span className="ml-1 text-[11px] font-bold text-acento">· aquí</span>}
          </span>
          <span className={cn("text-sm font-black tabular-nums", e.stock <= 0 ? "text-rose-300" : "text-gray-100")}>
            {e.stock}
          </span>
        </li>
      ))}
      <li className="text-[11px] text-muted">Para mover mercancía entre sucursales usa Traspasos.</li>
    </ul>
  );
}

function Lotes({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const [form, setForm] = useState({ numeroLote: "", caducidad: "", cantidad: "" });
  const [enviando, setEnviando] = useState(false);

  const registrar = async () => {
    const cantidad = Number(form.cantidad);
    if (!form.numeroLote.trim()) return notificar.error("Escribe el número de lote (viene en la caja)");
    if (!Number.isFinite(cantidad) || cantidad <= 0) return notificar.error("La cantidad debe ser mayor a cero");
    setEnviando(true);
    try {
      const res = await fetch("/api/lotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigoItem: ficha.producto.codigoItem,
          numeroLote: form.numeroLote.trim(),
          caducidad: form.caducidad || null,
          cantidad,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se registró el lote");
      notificar.exito(`Lote ${form.numeroLote.trim()} registrado`, `+${cantidad} en existencia`);
      setForm({ numeroLote: "", caducidad: "", cantidad: "" });
      onCambio();
    } catch (e: any) {
      notificar.error("No se registró el lote", e.message);
    } finally {
      setEnviando(false);
    }
  };

  const baja = async (idLote: string, numero: string) => {
    if (!window.confirm(`¿Dar de baja como merma lo que queda del lote ${numero}?`)) return;
    const res = await fetch(`/api/lotes/${idLote}/baja`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: "caducado" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      notificar.exito(`Lote ${numero} dado de baja`);
      onCambio();
    } else notificar.error("No se dio de baja", data.error);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Un <b>lote</b> agrupa piezas que llegaron juntas con la misma caducidad. Al vender, el sistema saca primero lo
        que caduca antes. Lo normal es registrarlos al <b>recibir un pedido</b>; aquí puedes agregar una entrada suelta.
      </p>
      <div className="grid grid-cols-[1.2fr_1fr_0.8fr_auto] items-end gap-2 rounded-xl border border-surface-600 p-3">
        <label className="block text-[11px] text-muted">
          Número de lote
          <input
            value={form.numeroLote}
            maxLength={40}
            onChange={(e) => setForm({ ...form, numeroLote: e.target.value })}
            className="input-dark mt-1 py-1.5 text-sm"
            placeholder="L-2410"
          />
        </label>
        <label className="block text-[11px] text-muted">
          Caducidad
          <input
            type="date"
            value={form.caducidad}
            onChange={(e) => setForm({ ...form, caducidad: e.target.value })}
            className="input-dark mt-1 py-1.5 text-sm"
          />
        </label>
        <label className="block text-[11px] text-muted">
          Cantidad
          <input
            type="number"
            min={1}
            inputMode="decimal"
            value={form.cantidad}
            onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
            className="input-dark mt-1 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={enviando}
          onClick={registrar}
          className="btn-primary h-9 px-3 text-xs disabled:opacity-60"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
        </button>
      </div>
      {ficha.lotes.length === 0 ? (
        <p className="text-sm text-muted">Sin lotes con existencia.</p>
      ) : (
        <ul className="space-y-2">
          {ficha.lotes.map((l) => {
            const dias = diasA(l.caducidad);
            return (
              <li key={l.idLote} className="flex items-center justify-between gap-3 rounded-xl border border-surface-600 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-100">Lote {l.numeroLote}</p>
                  <p
                    className={cn(
                      "text-xs",
                      dias == null ? "text-muted" : dias < 0 ? "text-rose-300" : dias <= 30 ? "text-amber-300" : "text-muted"
                    )}
                  >
                    {l.caducidad
                      ? `${dias! < 0 ? "Caducó" : "Caduca"} el ${new Date(l.caducidad).toLocaleDateString("es-MX")}`
                      : "Sin caducidad"}{" "}
                    · {l.sucursal}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-black tabular-nums text-gray-100">{l.cantidad}</span>
                  {dias != null && dias <= 30 && (
                    <button
                      type="button"
                      onClick={() => baja(l.idLote, l.numeroLote)}
                      className="rounded-lg border border-rose-500/40 px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-500/10"
                    >
                      Dar de baja
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Series({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const capturadas = texto
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const registrar = async () => {
    if (capturadas.length === 0) return notificar.error("Escanea o escribe al menos una serie");
    setEnviando(true);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoItem: ficha.producto.codigoItem, series: capturadas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se registraron las series");
      notificar.exito(`${data.registradas} serie(s) registradas`, "Cada una suma una pieza a la existencia");
      setTexto("");
      onCambio();
    } catch (e: any) {
      notificar.error("No se registraron las series", e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Dato etiqueta="Disponibles" valor={String(ficha.series.disponibles)} />
        <Dato etiqueta="Vendidas" valor={String(ficha.series.vendidas)} />
      </div>
      <div className="rounded-xl border border-surface-600 p-3">
        <p className="mb-1 text-xs font-bold text-gray-100">Registrar piezas nuevas</p>
        <p className="mb-2 text-[11px] text-muted">
          Escanea cada número de serie (una por renglón). Cada serie es una pieza; al vender se pide la serie exacta.
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          className="input-dark font-mono text-sm"
          placeholder={"SN-0001\nSN-0002"}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-muted">{capturadas.length} serie(s) capturadas</span>
          <button
            type="button"
            disabled={enviando || capturadas.length === 0}
            onClick={registrar}
            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar series"}
          </button>
        </div>
      </div>
      <ul className="space-y-1">
        {ficha.series.lista.map((s) => (
          <li key={s.serie} className="flex items-center justify-between rounded-lg bg-surface-700/50 px-3 py-1.5 text-xs">
            <span className="font-mono text-gray-100">{s.serie}</span>
            <span className={s.estado === "DISPONIBLE" ? "text-emerald-300" : "text-muted"}>
              {s.estado === "DISPONIBLE" ? `Disponible · ${s.sucursal}` : `Vendida${s.folioVenta ? ` · ${s.folioVenta}` : ""}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Variantes({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const p = ficha.producto;
  const esVariante = !!p.grupoVariante && p.grupoVariante !== p.codigoItem;
  return (
    <ul className="space-y-2">
      {!esVariante && (
        <li className="space-y-2 rounded-xl border border-surface-600 p-3">
          <p className="text-xs text-muted">
            Genera las combinaciones de este modelo (talla, color, medida). Cada una lleva su propia existencia y código.
          </p>
          <GeneradorVariantes codigoModelo={p.codigoItem} onCreadas={onCambio} />
        </li>
      )}
      <li className="text-xs text-muted">
        {ficha.variantes.length
          ? esVariante
            ? "Otras variantes del mismo modelo:"
            : "Variantes de este modelo:"
          : "Aún no tiene variantes."}
      </li>
      {ficha.variantes.map((v) => (
        <li key={v.codigoItem} className="flex items-center justify-between rounded-xl border border-surface-600 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm text-gray-100">{v.descripcion}</p>
            <p className="text-[11px] text-muted">
              {v.codigoItem}
              {v.atributos ? ` · ${Object.values(v.atributos).join(" / ")}` : ""}
            </p>
          </div>
          <span className="text-sm font-black tabular-nums text-gray-100">{v.stock}</span>
        </li>
      ))}
    </ul>
  );
}

function Historial({ codigo }: { codigo: string }) {
  const [movs, setMovs] = useState<Movimiento[] | null>(null);
  useEffect(() => {
    fetch(`/api/productos/${encodeURIComponent(codigo)}/kardex`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { movimientos: [] }))
      .then((d) => setMovs(d.movimientos ?? []))
      .catch(() => setMovs([]));
  }, [codigo]);
  if (!movs) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando historial…
      </p>
    );
  }
  if (movs.length === 0) return <p className="text-sm text-muted">Sin movimientos registrados.</p>;
  return (
    <ul className="space-y-1.5">
      {movs.map((m) => (
        <li key={m.idMovimiento} className="flex items-start justify-between gap-3 rounded-lg bg-surface-700/50 px-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="font-bold text-gray-100">{m.tipo}</p>
            <p className="break-anywhere text-muted">{m.motivo ?? "—"}</p>
            <p className="text-[10px] text-muted">
              {new Date(m.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })} · {m.usuario}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 text-sm font-black tabular-nums",
              Number(m.cantidadCambio) < 0 ? "text-rose-300" : "text-emerald-300"
            )}
          >
            {Number(m.cantidadCambio) > 0 ? "+" : ""}
            {Number(m.cantidadCambio)}
          </span>
        </li>
      ))}
    </ul>
  );
}
