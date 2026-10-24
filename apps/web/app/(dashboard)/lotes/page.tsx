"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Barcode, Boxes, Layers, Loader2, PackageX } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { cn } from "@/lib/utils";
import { BuscadorProducto, type ProductoEncontrado } from "@/components/ui/buscador-producto";
import { notificar } from "@/store/notificaciones";

// ============================================================
// Lotes, series y variantes (Paso 6).
// ============================================================

interface LotePorCaducar {
  idLote: string;
  codigoItem: string;
  descripcion: string;
  numeroLote: string;
  caducidad: string | null;
  cantidad: number;
  caducado: boolean;
}

type Seccion = "caducidad" | "lote" | "series" | "variantes";

const SECCIONES: Array<{ id: Seccion; label: string; icon: typeof Boxes }> = [
  { id: "caducidad", label: "Por caducar", icon: AlertTriangle },
  { id: "lote", label: "Entrada de lote", icon: Boxes },
  { id: "series", label: "Números de serie", icon: Barcode },
  { id: "variantes", label: "Variantes", icon: Layers },
];

async function enviar(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

export default function LotesPage() {
  const [seccion, setSeccion] = useState<Seccion>("caducidad");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // --- Por caducar ---
  const [dias, setDias] = useState(30);
  const [lotes, setLotes] = useState<LotePorCaducar[] | null>(null);
  const cargarLotes = useCallback(async () => {
    setLotes(null);
    const res = await fetch(`/api/lotes?dias=${dias}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLotes(res.ok ? data.lotes ?? [] : []);
    setError(res.ok ? null : data.error || "No se pudieron cargar los lotes");
  }, [dias]);
  useEffect(() => {
    if (seccion === "caducidad") cargarLotes();
  }, [seccion, cargarLotes]);

  // --- Formularios ---
  const [lote, setLote] = useState({ numeroLote: "", caducidad: "", cantidad: "" });
  const [productoLote, setProductoLote] = useState<ProductoEncontrado | null>(null);
  const [series, setSeries] = useState({ texto: "" });
  const [productoSeries, setProductoSeries] = useState<ProductoEncontrado | null>(null);
  const [productoModelo, setProductoModelo] = useState<ProductoEncontrado | null>(null);
  const [variantes, setVariantes] = useState({
    ejes: [
      { nombre: "Talla", valores: "CH, M, G" },
      { nombre: "Color", valores: "" },
    ],
  });

  const ejecutar = async (fn: () => Promise<string>) => {
    setOcupado(true);
    try {
      notificar.exito(await fn());
    } catch (e: any) {
      notificar.error(e.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <ErrorBoundary>
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-black text-gray-100">Lotes, series y variantes</h2>
            <p className="text-sm text-muted">
              Las entradas y series se registran en la sucursal activa. Activa &quot;Controla lotes&quot;
              o &quot;Número de serie&quot; en cada producto desde Inventario.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {SECCIONES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSeccion(s.id);
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold",
                  seccion === s.id
                    ? "border-acento bg-acento/10 text-acento"
                    : "border-surface-500 text-slate-300 hover:bg-surface-700"
                )}
              >
                <s.icon className="h-4 w-4" /> {s.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {seccion === "caducidad" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                Caducan en los próximos
                <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="input-dark w-24">
                  {[7, 15, 30, 60, 90].map((d) => (
                    <option key={d} value={d}>
                      {d} días
                    </option>
                  ))}
                </select>
              </label>
              {lotes === null ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                </p>
              ) : lotes.length === 0 ? (
                <p className="text-sm text-muted">Nada por caducar en ese plazo.</p>
              ) : (
                lotes.map((l) => (
                  <div
                    key={l.idLote}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm",
                      l.caducado ? "border-rose-500/40 bg-rose-500/5" : "border-surface-600 bg-surface-800"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-100">{l.descripcion}</p>
                      <p className="text-xs text-muted">
                        Lote {l.numeroLote} · {l.cantidad} en existencia · caduca {l.caducidad}
                        {l.caducado ? " · CADUCADO (no se vende)" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() =>
                        window.confirm(`¿Dar de baja ${l.cantidad} de "${l.descripcion}" (lote ${l.numeroLote})?`) &&
                        ejecutar(async () => {
                          await enviar(`/api/lotes/${l.idLote}/baja`, {
                            motivo: l.caducado ? "caducado" : "próximo a caducar",
                          });
                          await cargarLotes();
                          return `Lote ${l.numeroLote} dado de baja`;
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/20"
                    >
                      <PackageX className="h-3.5 w-3.5" /> Dar de baja
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {seccion === "lote" && (
            <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <Explicacion>
                Un <b>lote</b> son piezas que llegaron juntas con la misma caducidad (viene impreso en la caja). Al
                vender se descuenta primero lo que caduca antes. Lo más cómodo es capturarlo al{" "}
                <b>recibir un pedido</b>; usa esta pantalla para entradas sueltas. El producto debe tener activado
                “Controla lotes” en su ficha.
              </Explicacion>
              <div className="sm:col-span-2">
                <BuscadorProducto
                  etiqueta="Producto"
                  valor={productoLote}
                  onSeleccion={setProductoLote}
                  filtro={(p) => p.usaLotes === true}
                  motivoFiltro="no controla lotes"
                />
              </div>
              <input
                value={lote.numeroLote}
                onChange={(e) => setLote({ ...lote, numeroLote: e.target.value })}
                placeholder="Número de lote"
                className="input-dark"
              />
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Caducidad</span>
                <input
                  type="date"
                  value={lote.caducidad}
                  onChange={(e) => setLote({ ...lote, caducidad: e.target.value })}
                  className="input-dark"
                />
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
                disabled={ocupado || !productoLote || !lote.numeroLote.trim() || !(Number(lote.cantidad) > 0)}
                onClick={() =>
                  ejecutar(async () => {
                    await enviar("/api/lotes", {
                      ...lote,
                      codigoItem: productoLote!.codigoItem,
                      numeroLote: lote.numeroLote.trim(),
                      cantidad: Number(lote.cantidad),
                      caducidad: lote.caducidad || null,
                    });
                    setLote({ numeroLote: "", caducidad: "", cantidad: "" });
                    return `Lote registrado: +${Number(lote.cantidad)} de ${productoLote!.descripcion}`;
                  })
                }
                className="rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50 sm:col-span-2"
              >
                Registrar entrada
              </button>
            </div>
          )}

          {seccion === "series" && (
            <div className="max-w-xl space-y-3">
              <Explicacion>
                Para artículos únicos (celulares, herramientas eléctricas, electrónicos): cada <b>número de serie</b> es
                una pieza. Al vender se pide la serie exacta y al devolver regresa a disponible. Escanéalas una por
                renglón.
              </Explicacion>
              <BuscadorProducto
                etiqueta="Producto"
                valor={productoSeries}
                onSeleccion={setProductoSeries}
                filtro={(p) => p.usaSeries === true}
                motivoFiltro="no lleva número de serie"
              />
              <textarea
                value={series.texto}
                onChange={(e) => setSeries({ ...series, texto: e.target.value })}
                placeholder="Una serie por renglón (cada una es una pieza que entra al inventario)"
                rows={6}
                className="input-dark font-mono"
              />
              <button
                type="button"
                disabled={ocupado || !productoSeries || !series.texto.trim()}
                onClick={() =>
                  ejecutar(async () => {
                    const data = await enviar("/api/series", {
                      codigoItem: productoSeries!.codigoItem,
                      series: series.texto.split(/\r?\n/),
                    });
                    setSeries({ texto: "" });
                    return `${data.registradas} pieza(s) registradas con su serie`;
                  })
                }
                className="rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
              >
                Registrar series
              </button>
            </div>
          )}

          {seccion === "variantes" && (
            <div className="max-w-xl space-y-3">
              <Explicacion>
                Para ropa, calzado o pinturas: eliges un producto <b>modelo</b> y los ejes (Talla: CH, M, G · Color:
                Rojo, Azul). Cada combinación se crea como un producto propio con su existencia y código de barras,
                y comparte precio, impuestos y categoría con el modelo.
              </Explicacion>
              <BuscadorProducto etiqueta="Producto modelo" valor={productoModelo} onSeleccion={setProductoModelo} />
              {variantes.ejes.map((eje, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input
                    value={eje.nombre}
                    onChange={(e) =>
                      setVariantes({
                        ...variantes,
                        ejes: variantes.ejes.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)),
                      })
                    }
                    placeholder="Eje (Talla)"
                    className="input-dark"
                  />
                  <input
                    value={eje.valores}
                    onChange={(e) =>
                      setVariantes({
                        ...variantes,
                        ejes: variantes.ejes.map((x, k) => (k === i ? { ...x, valores: e.target.value } : x)),
                      })
                    }
                    placeholder="Valores separados por coma"
                    className="input-dark col-span-2"
                  />
                </div>
              ))}
              <button
                type="button"
                disabled={ocupado || !productoModelo}
                onClick={() =>
                  ejecutar(async () => {
                    const data = await enviar(
                      `/api/productos/${encodeURIComponent(productoModelo!.codigoItem)}/variantes`,
                      {
                        ejes: variantes.ejes
                          .filter((e) => e.nombre.trim() && e.valores.trim())
                          .map((e) => ({ nombre: e.nombre, valores: e.valores.split(",") })),
                      }
                    );
                    return `${data.creadas.length} variante(s) creadas${
                      data.omitidas.length ? `, ${data.omitidas.length} ya existían` : ""
                    }`;
                  })
                }
                className="rounded-xl bg-acento px-4 py-2.5 text-sm font-bold text-btn-ink disabled:opacity-50"
              >
                Generar variantes
              </button>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </>
  );
}

function Explicacion({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-surface-600 bg-surface-800 p-3 text-xs leading-relaxed text-muted sm:col-span-2">
      {children}
    </p>
  );
}
