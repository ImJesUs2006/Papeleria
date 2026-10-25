"use client";

import { Layers, Plus, Trash2 } from "lucide-react";
import { MAX_ESCALAS } from "@/lib/precios";

export interface FilaEscala {
  desde: string;
  precio: string;
  nombre: string;
}

/** Filas capturadas → lo que espera la API (las vacías se ignoran). */
export function filasAEscalas(filas: FilaEscala[]) {
  return filas
    .filter((f) => f.desde.trim() !== "" || f.precio.trim() !== "")
    .map((f) => ({
      desde: Number(f.desde),
      precio: Number(f.precio),
      ...(f.nombre.trim() ? { nombre: f.nombre.trim() } : {}),
    }));
}

export function escalasAFilas(escalas: unknown): FilaEscala[] {
  if (!Array.isArray(escalas)) return [];
  return escalas.map((e: any) => ({
    desde: String(e?.desde ?? ""),
    precio: e?.precio != null ? String(e.precio) : "",
    nombre: typeof e?.nombre === "string" ? e.nombre : "",
  }));
}

/**
 * Precios por volumen del producto: "desde N piezas, $X c/u". El POS los
 * aplica solo al llegar a la cantidad (y el servidor los vuelve a calcular).
 */
export function EditorEscalas({
  filas,
  onChange,
  precioMenudeo,
}: {
  filas: FilaEscala[];
  onChange: (filas: FilaEscala[]) => void;
  precioMenudeo: number | null | undefined;
}) {
  const set = (i: number, cambio: Partial<FilaEscala>) =>
    onChange(filas.map((f, k) => (k === i ? { ...f, ...cambio } : f)));

  return (
    <div className="rounded-xl border border-surface-500 bg-surface-700/50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-bold text-gray-100">
          <Layers className="h-3.5 w-3.5 text-acento" /> Precios de mayoreo
        </span>
        <button
          type="button"
          disabled={filas.length >= MAX_ESCALAS}
          onClick={() => onChange([...filas, { desde: "", precio: "", nombre: "" }])}
          className="inline-flex items-center gap-1 rounded-lg border border-surface-500 px-2 py-1 text-[11px] font-bold text-gray-200 hover:border-acento/60 disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> Agregar escala
        </button>
      </div>
      {filas.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted">
          Ejemplo: desde <b>12</b> piezas a <b>$4.00</b> c/u (docena) y desde <b>100</b> a <b>$3.50</b> (caja). El
          cobro cambia solo al llegar a la cantidad; con el interruptor “Precio mayorista” del cobro se aplica la escala más baja sin importar la cantidad.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_1.3fr_auto] gap-2 text-[10px] font-bold uppercase tracking-wider text-muted">
            <span>Desde (piezas)</span>
            <span>Precio c/u</span>
            <span>Nombre (opcional)</span>
            <span className="w-7" />
          </div>
          {filas.map((f, i) => {
            const precio = Number(f.precio);
            const ahorro =
              precioMenudeo && Number.isFinite(precio) && precio > 0 && precio < precioMenudeo
                ? Math.round((1 - precio / precioMenudeo) * 100)
                : null;
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_1.3fr_auto] items-center gap-2">
                <input
                  type="number"
                  min={2}
                  step={1}
                  inputMode="numeric"
                  value={f.desde}
                  onChange={(e) => set(i, { desde: e.target.value })}
                  className="input-dark py-1.5 text-sm"
                  placeholder="12"
                  aria-label={`Escala ${i + 1}: desde cuántas piezas`}
                />
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={f.precio}
                    onChange={(e) => set(i, { precio: e.target.value })}
                    className="input-dark py-1.5 text-sm"
                    placeholder="4.00"
                    aria-label={`Escala ${i + 1}: precio unitario`}
                  />
                  {ahorro != null && (
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-300">
                      -{ahorro}%
                    </span>
                  )}
                </div>
                <input
                  value={f.nombre}
                  maxLength={30}
                  onChange={(e) => set(i, { nombre: e.target.value })}
                  className="input-dark py-1.5 text-sm"
                  placeholder="Docena, Caja…"
                  aria-label={`Escala ${i + 1}: nombre`}
                />
                <button
                  type="button"
                  onClick={() => onChange(filas.filter((_, k) => k !== i))}
                  aria-label={`Quitar escala ${i + 1}`}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
