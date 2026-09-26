"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Save,
  Loader2,
  Check,
  AlertTriangle,
  Search,
  FileSpreadsheet,
  Barcode,
  RotateCcw,
} from "lucide-react";
import { LabelModal, LabelProduct, useLabelModal } from "@/components/inventario/label-modal";
import { ProductImageUpload } from "@/components/inventario/product-image-upload";
import { useConfigStore } from "@/store/config";
import { cn } from "@/lib/utils";

interface RowEdit {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  stockActual: number;
  stockMinimo: number;
}

type EstadoFila = "ok" | "guardando" | "guardado" | "error";

export function QuickEdit() {
  const usarImagenes = useConfigStore((s) => s.config?.usarImagenesProductos ?? true);
  const [rows, setRows] = useState<RowEdit[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [errorGlobal, setErrorGlobal] = useState("");
  const { setEtiqueta, node } = useLabelModal();

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      params.set("sortBy", "descripcion");
      params.set("limit", "100");
      const res = await fetch(`/api/productos?${params.toString()}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      setRows(
        (data.data ?? []).map((p: any) => ({
          codigoItem: p.codigoItem,
          descripcion: p.descripcion,
          precioUnitario: Number(p.precioUnitario),
          stockActual: Number(p.stockActual),
          stockMinimo: Number(p.stockMinimo),
        }))
      );
      setErrorGlobal("");
    } catch {
      setErrorGlobal("No se pudieron cargar los productos");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(cargar, 350);
    return () => clearTimeout(t);
  }, [cargar]);

  const actualizar = (codigo: string, campo: keyof RowEdit, valor: number) => {
    setRows((prev) =>
      prev.map((r) => (r.codigoItem === codigo ? { ...r, [campo]: valor } : r))
    );
  };

  const guardarFila = async (row: RowEdit) => {
    if (estados[row.codigoItem] === "guardando") return;
    setEstados((p) => ({ ...p, [row.codigoItem]: "guardando" }));
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(row.codigoItem)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          precioUnitario: row.precioUnitario,
          stockActual: row.stockActual,
          stockMinimo: row.stockMinimo,
        }),
      });
      if (!res.ok) throw new Error("error");
      setEstados((p) => ({ ...p, [row.codigoItem]: "guardado" }));
      setTimeout(() => {
        setEstados((p) => ({ ...p, [row.codigoItem]: "ok" }));
      }, 1800);
    } catch {
      setEstados((p) => ({ ...p, [row.codigoItem]: "error" }));
    }
  };

  const guardarTodos = async () => {
    for (const r of rows) await guardarFila(r);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar productos a editar..."
            className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
          />
        </div>
        <button
          onClick={guardarTodos}
          disabled={rows.length === 0}
          className="btn-primary flex items-center gap-2 py-2.5 px-5 text-sm"
        >
          <Save className="h-4 w-4" />
          Guardar todo
        </button>
      </div>

      {errorGlobal && (
        <div className="mb-4 flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-3 text-sm text-gray-100">
          <AlertTriangle className="h-4 w-4 text-neon-red" />
          {errorGlobal}
        </div>
      )}

      <div className="bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-surface-600">
          <FileSpreadsheet className="h-5 w-5 text-neon-green" />
          <span className="font-bold text-gray-100">
            Hoja de edición rápida{" "}
            <span className="text-muted font-normal">({rows.length})</span>
          </span>
          <span className="ml-auto text-[11px] text-muted">
            Edita y al salir del campo se guarda automáticamente
          </span>
        </div>

        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando productos...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
              <Barcode className="h-10 w-10 opacity-30" />
              <p className="text-sm">Sin productos para editar</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-700">
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-surface-500">
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  {usarImagenes && <th className="px-4 py-3 font-semibold w-24">Imagen</th>}
                  <th className="px-4 py-3 font-semibold w-32">Precio ($)</th>
                  <th className="px-4 py-3 font-semibold w-24">Stock</th>
                  <th className="px-4 py-3 font-semibold w-24">Stock min</th>
                  <th className="px-4 py-3 font-semibold w-16">Etiqueta</th>
                  <th className="px-4 py-3 font-semibold w-40">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const estado = estados[row.codigoItem] ?? "ok";
                  return (
                    <motion.tr
                      key={row.codigoItem}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.4) }}
                      className="border-b border-surface-700 last:border-0 group"
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-gray-100 font-medium">{row.descripcion}</span>
                        <span className="block text-[10px] text-muted">{row.codigoItem}</span>
                      </td>
                      {usarImagenes && (
                        <td className="px-4 py-2.5">
                          <ProductImageUpload codigo={row.codigoItem} size={40} />
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.precioUnitario}
                          onChange={(e) =>
                            actualizar(row.codigoItem, "precioUnitario", Number(e.target.value))
                          }
                          onBlur={() => guardarFila(row)}
                          className="w-full bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-right text-sm font-bold text-neon-green focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          value={row.stockActual}
                          onChange={(e) =>
                            actualizar(row.codigoItem, "stockActual", Math.round(Number(e.target.value)))
                          }
                          onBlur={() => guardarFila(row)}
                          className="w-full bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-right text-sm text-gray-100 focus:border-neon-green focus:outline-none transition-all"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <input
                          type="number"
                          min={0}
                          value={row.stockMinimo}
                          onChange={(e) =>
                            actualizar(row.codigoItem, "stockMinimo", Math.round(Number(e.target.value)))
                          }
                          onBlur={() => guardarFila(row)}
                          className="w-full bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-right text-sm text-muted focus:border-neon-green focus:outline-none transition-all"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() =>
                            setEtiqueta({
                              codigoItem: row.codigoItem,
                              descripcion: row.descripcion,
                              precioUnitario: row.precioUnitario,
                            })
                          }
                          className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-cyan/10 flex items-center justify-center text-muted hover:text-neon-cyan transition-colors"
                          title="Generar etiqueta"
                        >
                          <Barcode className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[11px] font-bold",
                            estado === "guardando" && "text-neon-cyan",
                            estado === "guardado" && "text-neon-green",
                            estado === "error" && "text-neon-red"
                          )}
                        >
                          {estado === "guardando" && (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" /> Guardando...
                            </>
                          )}
                          {estado === "guardado" && (
                            <>
                              <Check className="h-3 w-3" /> Guardado
                            </>
                          )}
                          {estado === "error" && (
                            <>
                              <AlertTriangle className="h-3 w-3" /> Error - toca guardar
                            </>
                          )}
                          {estado === "ok" && (
                            <button
                              onClick={() => guardarFila(row)}
                              className="flex items-center gap-1 text-muted hover:text-gray-100 transition-colors"
                            >
                              <RotateCcw className="h-3 w-3" /> Revertir cambios
                            </button>
                          )}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {node}
    </div>
  );
}

export type { LabelProduct };
export { LabelModal };