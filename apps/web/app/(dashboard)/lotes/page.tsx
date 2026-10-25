"use client";

import { useCallback, useEffect, useState } from "react";
import { Barcode, Boxes, Layers, Loader2, PackageX, Plus, Search, Trash2, X } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { cn } from "@/lib/utils";
import { BuscadorProducto, type ProductoEncontrado } from "@/components/ui/buscador-producto";
import { GeneradorVariantes } from "@/components/inventario/generador-variantes";
import { notificar } from "@/store/notificaciones";

// ============================================================
// Lotes, series y variantes: listas completas con su estado, y desde
// aquí se registran entradas, se dan de baja piezas y se quitan variantes.
// Lo que tiene historia (ventas, kardex) nunca se borra: se da de baja.
// ============================================================

type Seccion = "lotes" | "series" | "variantes";

const SECCIONES: Array<{ id: Seccion; label: string; icon: typeof Boxes; ayuda: string }> = [
  {
    id: "lotes",
    label: "Lotes",
    icon: Boxes,
    ayuda: "Piezas que llegaron juntas con la misma caducidad. Al vender se descuenta primero lo que caduca antes.",
  },
  {
    id: "series",
    label: "Números de serie",
    icon: Barcode,
    ayuda: "Cada serie es una pieza única (garantías). Al vender se indica cuál sale; al devolverla regresa a disponible.",
  },
  {
    id: "variantes",
    label: "Variantes",
    icon: Layers,
    ayuda: "Un modelo en varias tallas, colores o medidas. Cada combinación es un producto con su propia existencia.",
  },
];

async function pedir(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

export default function LotesPage() {
  const [seccion, setSeccion] = useState<Seccion>("lotes");
  const actual = SECCIONES.find((s) => s.id === seccion)!;
  return (
    <ErrorBoundary>
      <div className="space-y-4 p-6">
        <div>
          <h2 className="text-2xl font-black text-gray-100">Lotes, series y variantes</h2>
          <p className="text-sm text-muted">
            Se activan en cada producto con &quot;¿Control extra?&quot;. Las entradas se registran en la sucursal activa.
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist">
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={seccion === s.id}
              onClick={() => setSeccion(s.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold",
                seccion === s.id ? "border-acento bg-acento/10 text-acento" : "border-surface-500 text-slate-300 hover:bg-surface-700"
              )}
            >
              <s.icon className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </div>
        <p className="rounded-xl border border-surface-600 bg-surface-800 p-3 text-xs leading-relaxed text-muted">{actual.ayuda}</p>

        {seccion === "lotes" ? <PestanaLotes /> : seccion === "series" ? <PestanaSeries /> : <PestanaVariantes />}
      </div>
    </ErrorBoundary>
  );
}

// ---------------------------------------------------------------- utilidades de UI

function Filtros<T extends string>({
  opciones,
  valor,
  onCambio,
}: {
  opciones: Array<[T, string]>;
  valor: T;
  onCambio: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map(([v, etiqueta]) => (
        <button
          key={v}
          type="button"
          onClick={() => onCambio(v)}
          aria-pressed={valor === v}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-bold",
            valor === v ? "border-acento bg-acento/10 text-acento" : "border-surface-500 text-muted hover:text-gray-100"
          )}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}

function Busqueda({ valor, onCambio, placeholder }: { valor: string; onCambio: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-[14rem] flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder} className="input-dark pl-9" />
    </div>
  );
}

function BotonRegistrar({ abierto, onClick, texto }: { abierto: boolean; onClick: () => void; texto: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold",
        abierto ? "border border-surface-500 text-gray-200" : "bg-acento text-btn-ink"
      )}
    >
      {abierto ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {abierto ? "Cerrar" : texto}
    </button>
  );
}

function Vacio({ cargando, texto }: { cargando: boolean; texto: string }) {
  return cargando ? (
    <p className="flex items-center gap-2 py-6 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
    </p>
  ) : (
    <p className="py-6 text-center text-sm text-muted">{texto}</p>
  );
}

/** Retrasa la búsqueda para no consultar en cada tecla. */
function useDebounce<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}

// ---------------------------------------------------------------- Lotes

type EstadoLote = "TODOS" | "VIGENTE" | "POR_CADUCAR" | "CADUCADO" | "AGOTADO";
interface LoteFila {
  idLote: string;
  codigoItem: string;
  descripcion: string;
  numeroLote: string;
  caducidad: string | null;
  cantidad: number;
  estado: Exclude<EstadoLote, "TODOS">;
}
const ESTILO_LOTE: Record<LoteFila["estado"], [string, string]> = {
  VIGENTE: ["Vigente", "border-emerald-500/40 text-emerald-300"],
  POR_CADUCAR: ["Por caducar", "border-amber-500/40 text-amber-300"],
  CADUCADO: ["Caducado · no se vende", "border-rose-500/40 text-rose-300"],
  AGOTADO: ["Agotado", "border-surface-500 text-muted"],
};

function PestanaLotes() {
  const [estado, setEstado] = useState<EstadoLote>("TODOS");
  const [q, setQ] = useState("");
  const qd = useDebounce(q);
  const [lotes, setLotes] = useState<LoteFila[] | null>(null);
  const [form, setForm] = useState(false);

  const cargar = useCallback(async () => {
    setLotes(null);
    try {
      const d = await pedir(`/api/lotes?vista=lista&estado=${estado}&q=${encodeURIComponent(qd)}`);
      setLotes(d.lotes ?? []);
    } catch (e: any) {
      notificar.error("Lotes", e.message);
      setLotes([]);
    }
  }, [estado, qd]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const baja = async (l: LoteFila) => {
    const motivo = window.prompt(
      `Dar de baja ${l.cantidad} de "${l.descripcion}" (lote ${l.numeroLote}) como merma.\nMotivo:`,
      l.estado === "CADUCADO" ? "caducado" : "dañado"
    );
    if (!motivo) return;
    try {
      await pedir(`/api/lotes/${l.idLote}/baja`, { method: "POST", body: JSON.stringify({ motivo }) });
      notificar.exito(`Lote ${l.numeroLote} dado de baja`);
      cargar();
    } catch (e: any) {
      notificar.error(e.message);
    }
  };
  const eliminar = async (l: LoteFila) => {
    if (!window.confirm(`¿Eliminar el registro del lote agotado ${l.numeroLote}?`)) return;
    try {
      await pedir(`/api/lotes/${l.idLote}`, { method: "DELETE" });
      notificar.exito(`Lote ${l.numeroLote} eliminado`);
      cargar();
    } catch (e: any) {
      notificar.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Busqueda valor={q} onCambio={setQ} placeholder="Buscar por producto, código o lote" />
        <BotonRegistrar abierto={form} onClick={() => setForm(!form)} texto="Entrada de lote" />
      </div>
      {form && (
        <FormLote
          onListo={() => {
            setForm(false);
            cargar();
          }}
        />
      )}
      <Filtros
        valor={estado}
        onCambio={setEstado}
        opciones={[
          ["TODOS", "Todos"],
          ["VIGENTE", "Vigentes"],
          ["POR_CADUCAR", "Por caducar (30 días)"],
          ["CADUCADO", "Caducados"],
          ["AGOTADO", "Agotados"],
        ]}
      />
      {!lotes?.length ? (
        <Vacio cargando={lotes === null} texto="No hay lotes con ese filtro." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-600 bg-surface-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-600 text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">Caducidad</th>
                <th className="px-4 py-3 text-right">Existencia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lotes.map((l) => {
                const [etiqueta, estilo] = ESTILO_LOTE[l.estado];
                return (
                  <tr key={l.idLote} className="border-b border-surface-700 last:border-0" data-testid="fila-lote">
                    <td className="px-4 py-2.5">
                      <p className="font-bold text-gray-100">{l.descripcion}</p>
                      <p className="text-[11px] text-muted">{l.codigoItem}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-200">{l.numeroLote}</td>
                    <td className="px-4 py-2.5 text-gray-200">{l.caducidad ?? "Sin caducidad"}</td>
                    <td className="px-4 py-2.5 text-right font-bold tabular-nums text-gray-100">{l.cantidad}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-bold", estilo)}>{etiqueta}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {l.estado === "AGOTADO" ? (
                        <button
                          type="button"
                          onClick={() => eliminar(l)}
                          className="inline-flex items-center gap-1 rounded-lg border border-surface-500 px-2.5 py-1 text-xs font-bold text-muted hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => baja(l)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/10"
                        >
                          <PackageX className="h-3.5 w-3.5" /> Dar de baja
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormLote({ onListo }: { onListo: () => void }) {
  const [producto, setProducto] = useState<ProductoEncontrado | null>(null);
  const [lote, setLote] = useState({ numeroLote: "", caducidad: "", cantidad: "" });
  const [ocupado, setOcupado] = useState(false);
  const registrar = async () => {
    setOcupado(true);
    try {
      await pedir("/api/lotes", {
        method: "POST",
        body: JSON.stringify({
          codigoItem: producto!.codigoItem,
          numeroLote: lote.numeroLote.trim(),
          cantidad: Number(lote.cantidad),
          caducidad: lote.caducidad || null,
        }),
      });
      notificar.exito(`Lote registrado: +${Number(lote.cantidad)} de ${producto!.descripcion}`);
      onListo();
    } catch (e: any) {
      notificar.error(e.message);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="grid max-w-2xl grid-cols-1 gap-3 rounded-2xl border border-surface-600 bg-surface-800 p-4 sm:grid-cols-3">
      <p className="text-xs text-muted sm:col-span-3">
        Lo más cómodo es capturar el lote al <b>recibir un pedido</b>; usa esto para entradas sueltas.
      </p>
      <div className="sm:col-span-3">
        <BuscadorProducto
          etiqueta="Producto"
          valor={producto}
          onSeleccion={setProducto}
          filtro={(p) => p.usaLotes === true}
          motivoFiltro="no controla lotes"
        />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Número de lote</span>
        <input value={lote.numeroLote} onChange={(e) => setLote({ ...lote, numeroLote: e.target.value })} className="input-dark" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Caducidad</span>
        <input type="date" value={lote.caducidad} onChange={(e) => setLote({ ...lote, caducidad: e.target.value })} className="input-dark" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">Cantidad recibida</span>
        <input
          type="number"
          min={0}
          step="0.001"
          value={lote.cantidad}
          onChange={(e) => setLote({ ...lote, cantidad: e.target.value })}
          className="input-dark"
        />
      </label>
      <button
        type="button"
        disabled={ocupado || !producto || !lote.numeroLote.trim() || !(Number(lote.cantidad) > 0)}
        onClick={registrar}
        className="rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50 sm:col-span-3"
      >
        Registrar entrada
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Series

type EstadoSerie = "TODAS" | "DISPONIBLE" | "VENDIDO";
interface SerieFila {
  idSerie: string;
  serie: string;
  codigoItem: string;
  descripcion: string;
  estado: "DISPONIBLE" | "VENDIDO";
  folioVenta: string | null;
  registrada: string;
}

function PestanaSeries() {
  const [estado, setEstado] = useState<EstadoSerie>("TODAS");
  const [q, setQ] = useState("");
  const qd = useDebounce(q);
  const [series, setSeries] = useState<SerieFila[] | null>(null);
  const [form, setForm] = useState(false);

  const cargar = useCallback(async () => {
    setSeries(null);
    try {
      const filtro = estado === "TODAS" ? "" : `&estado=${estado}`;
      const d = await pedir(`/api/series?todas=1${filtro}&q=${encodeURIComponent(qd.toUpperCase())}`);
      setSeries(d.series ?? []);
    } catch (e: any) {
      notificar.error("Series", e.message);
      setSeries([]);
    }
  }, [estado, qd]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const baja = async (s: SerieFila) => {
    const motivo = window.prompt(`Dar de baja la pieza con serie ${s.serie} (${s.descripcion}).\nMotivo:`, "dañada");
    if (!motivo) return;
    try {
      await pedir(`/api/series/${s.idSerie}`, { method: "DELETE", body: JSON.stringify({ motivo }) });
      notificar.exito(`Serie ${s.serie} dada de baja`, "La pieza salió del inventario y quedó en el kardex");
      cargar();
    } catch (e: any) {
      notificar.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Busqueda valor={q} onCambio={setQ} placeholder="Buscar por serie, producto o código" />
        <BotonRegistrar abierto={form} onClick={() => setForm(!form)} texto="Registrar series" />
      </div>
      {form && (
        <FormSeries
          onListo={() => {
            setForm(false);
            cargar();
          }}
        />
      )}
      <Filtros
        valor={estado}
        onCambio={setEstado}
        opciones={[
          ["TODAS", "Todas"],
          ["DISPONIBLE", "Disponibles"],
          ["VENDIDO", "Vendidas"],
        ]}
      />
      {!series?.length ? (
        <Vacio cargando={series === null} texto="No hay series con ese filtro." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-600 bg-surface-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-600 text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-3">Serie</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Venta</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.idSerie} className="border-b border-surface-700 last:border-0" data-testid="fila-serie">
                  <td className="px-4 py-2.5 font-mono font-bold text-gray-100">{s.serie}</td>
                  <td className="px-4 py-2.5">
                    <p className="text-gray-100">{s.descripcion}</p>
                    <p className="text-[11px] text-muted">{s.codigoItem}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-bold",
                        s.estado === "DISPONIBLE" ? "border-emerald-500/40 text-emerald-300" : "border-surface-500 text-muted"
                      )}
                    >
                      {s.estado === "DISPONIBLE" ? "Disponible" : "Vendida"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{s.folioVenta ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {s.estado === "DISPONIBLE" ? (
                      <button
                        type="button"
                        onClick={() => baja(s)}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs font-bold text-rose-300 hover:bg-rose-500/10"
                      >
                        <PackageX className="h-3.5 w-3.5" /> Dar de baja
                      </button>
                    ) : (
                      <span className="text-[11px] text-muted">Historial de garantía</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormSeries({ onListo }: { onListo: () => void }) {
  const [producto, setProducto] = useState<ProductoEncontrado | null>(null);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const piezas = texto.split(/\r?\n/).filter((s) => s.trim()).length;
  const registrar = async () => {
    setOcupado(true);
    try {
      const d = await pedir("/api/series", {
        method: "POST",
        body: JSON.stringify({ codigoItem: producto!.codigoItem, series: texto.split(/\r?\n/) }),
      });
      notificar.exito(`${d.registradas} pieza(s) registradas con su serie`);
      onListo();
    } catch (e: any) {
      notificar.error(e.message);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="max-w-2xl space-y-3 rounded-2xl border border-surface-600 bg-surface-800 p-4">
      <BuscadorProducto
        etiqueta="Producto"
        valor={producto}
        onSeleccion={setProducto}
        filtro={(p) => p.usaSeries === true}
        motivoFiltro="no lleva número de serie"
      />
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Una serie por renglón (cada una es una pieza que entra al inventario)"
        rows={5}
        className="input-dark font-mono"
      />
      <button
        type="button"
        disabled={ocupado || !producto || piezas === 0}
        onClick={registrar}
        className="w-full rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
      >
        Registrar {piezas || ""} serie{piezas === 1 ? "" : "s"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- Variantes

interface Modelo {
  modelo: string;
  descripcion: string;
  existenciaTotal: number;
  variantes: Array<{
    codigoItem: string;
    descripcion: string;
    atributos: Record<string, string>;
    existencia: number;
    precio: number;
    codigoBarras: string | null;
  }>;
}

function PestanaVariantes() {
  const [q, setQ] = useState("");
  const qd = useDebounce(q);
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [form, setForm] = useState(false);
  const [modelo, setModelo] = useState<ProductoEncontrado | null>(null);

  const cargar = useCallback(async () => {
    setModelos(null);
    try {
      const d = await pedir(`/api/variantes?q=${encodeURIComponent(qd)}`);
      setModelos(d.modelos ?? []);
    } catch (e: any) {
      notificar.error("Variantes", e.message);
      setModelos([]);
    }
  }, [qd]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const quitar = async (codigo: string, descripcion: string) => {
    if (!window.confirm(`¿Quitar la variante "${descripcion}"? Si ya tuvo movimientos se da de baja (no se borra).`)) return;
    try {
      const r = await pedir(`/api/productos/${encodeURIComponent(codigo)}`, { method: "DELETE" });
      notificar.exito(r.modo === "ELIMINADO" ? "Variante eliminada" : "Variante dada de baja", r.motivo);
      cargar();
    } catch (e: any) {
      notificar.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Busqueda valor={q} onCambio={setQ} placeholder="Buscar modelo o variante" />
        <BotonRegistrar abierto={form} onClick={() => setForm(!form)} texto="Generar variantes" />
      </div>
      {form && (
        <div className="max-w-2xl space-y-3 rounded-2xl border border-surface-600 bg-surface-800 p-4">
          <p className="text-xs text-muted">
            Elige el producto <b>modelo</b>. Cada combinación hereda su precio, impuestos y categoría, y lleva su propia
            existencia y código.
          </p>
          <BuscadorProducto
            etiqueta="Producto modelo"
            valor={modelo}
            onSeleccion={setModelo}
            filtro={(p) => !p.esServicio && (!p.grupoVariante || p.grupoVariante === p.codigoItem)}
            motivoFiltro="es servicio o ya es una variante"
          />
          <GeneradorVariantes
            codigoModelo={modelo?.codigoItem ?? null}
            onCreadas={() => {
              setForm(false);
              setModelo(null);
              cargar();
            }}
          />
        </div>
      )}
      {!modelos?.length ? (
        <Vacio cargando={modelos === null} texto="Aún no hay productos con variantes." />
      ) : (
        modelos.map((m) => (
          <div key={m.modelo} className="rounded-2xl border border-surface-600 bg-surface-800" data-testid="modelo-variantes">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-600 px-4 py-3">
              <div>
                <p className="font-bold text-gray-100">{m.descripcion}</p>
                <p className="text-[11px] text-muted">
                  Modelo {m.modelo} · {m.variantes.length} variantes · {m.existenciaTotal} en existencia
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {m.variantes.map((v) => (
                    <tr key={v.codigoItem} className="border-b border-surface-700 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-muted">{v.codigoItem}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(v.atributos).map(([k, val]) => (
                            <span key={k} className="rounded-full border border-surface-500 px-2 py-0.5 text-[11px] text-gray-200">
                              {k}: <b>{val}</b>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-100">{v.existencia} pzs</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-200">${v.precio.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitar(v.codigoItem, v.descripcion)}
                          aria-label={`Quitar ${v.descripcion}`}
                          className="rounded-lg p-1.5 text-muted hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
