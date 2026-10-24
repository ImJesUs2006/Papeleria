"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Package, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ProductoEncontrado {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number | string;
  stockActual: number | string;
  usaLotes?: boolean;
  usaSeries?: boolean;
  esServicio?: boolean;
  grupoVariante?: string | null;
  imagenUrl?: string | null;
}

/**
 * Buscador de productos reutilizable: escribes parte del nombre, el código
 * o escaneas el código de barras y eliges de la lista (con flechas y Enter).
 * Sustituye a los campos donde había que escribir el código de memoria.
 */
export function BuscadorProducto({
  valor,
  onSeleccion,
  filtro,
  motivoFiltro,
  placeholder = "Busca por nombre, código o escanea…",
  etiqueta,
}: {
  valor: ProductoEncontrado | null;
  onSeleccion: (p: ProductoEncontrado | null) => void;
  /** Solo se pueden elegir los productos que cumplan (los demás aparecen deshabilitados). */
  filtro?: (p: ProductoEncontrado) => boolean;
  /** Por qué un producto no se puede elegir (p. ej. "No maneja lotes"). */
  motivoFiltro?: string;
  placeholder?: string;
  etiqueta?: string;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoEncontrado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados([]);
      return;
    }
    let vivo = true;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/productos/search?q=${encodeURIComponent(texto)}`, { cache: "no-store" });
        const data = r.ok ? await r.json() : [];
        if (!vivo) return;
        setResultados(Array.isArray(data) ? data : []);
        setActivo(0);
        setAbierto(true);
      } finally {
        if (vivo) setCargando(false);
      }
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener("mousedown", fuera);
    return () => window.removeEventListener("mousedown", fuera);
  }, []);

  const permitido = (p: ProductoEncontrado) => (filtro ? filtro(p) : true);
  const elegir = (p: ProductoEncontrado) => {
    if (!permitido(p)) return;
    onSeleccion(p);
    setQ("");
    setResultados([]);
    setAbierto(false);
  };

  if (valor) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-acento/50 bg-acento/5 px-3 py-2">
        <Package className="h-4 w-4 shrink-0 text-acento" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-100" title={valor.descripcion}>
            {valor.descripcion}
          </p>
          <p className="text-[11px] text-muted">
            {valor.codigoItem} · existencia {Number(valor.stockActual)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSeleccion(null)}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:text-gray-100"
        >
          <X className="h-3.5 w-3.5" /> Cambiar
        </button>
      </div>
    );
  }

  return (
    <div ref={caja} className="relative">
      {etiqueta && <span className="mb-1 block text-xs text-muted">{etiqueta}</span>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => resultados.length && setAbierto(true)}
          onKeyDown={(e) => {
            if (!abierto || !resultados.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActivo((a) => Math.min(a + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const exacto = resultados.find((r) => r.codigoItem.toLowerCase() === q.trim().toLowerCase());
              elegir(exacto ?? resultados[activo]);
            } else if (e.key === "Escape") {
              setAbierto(false);
            }
          }}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-autocomplete="list"
          className="input-dark pl-9"
        />
        {cargando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />}
      </div>
      {abierto && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-surface-500 bg-surface-800 p-1 shadow-card"
        >
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">Sin coincidencias</li>
          ) : (
            resultados.map((p, i) => {
              const ok = permitido(p);
              return (
                <li
                  key={p.codigoItem}
                  role="option"
                  aria-selected={i === activo}
                  aria-disabled={!ok}
                  onMouseEnter={() => setActivo(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(p);
                  }}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2",
                    i === activo && ok && "bg-surface-600",
                    !ok && "cursor-not-allowed opacity-50"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-100">{p.descripcion}</p>
                    <p className="text-[11px] text-muted">
                      {p.codigoItem}
                      {p.usaLotes ? " · lotes" : ""}
                      {p.usaSeries ? " · series" : ""}
                      {!ok && motivoFiltro ? ` · ${motivoFiltro}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-gray-200">{Number(p.stockActual)} pzs</span>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
