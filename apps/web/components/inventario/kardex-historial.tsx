"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, History, ArrowDownCircle, ArrowUpCircle, Wrench, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface KardexMovimiento {
  idMovimiento: string;
  fecha: string;
  cantidadCambio: number;
  tipo: "ENTRADA" | "SALIDA" | "AJUSTE";
  motivo: string;
  usuario: string;
}

interface ProductoSugerido {
  codigoItem: string;
  descripcion: string;
  stockActual: number;
}

const TIPO_ICONO = {
  ENTRADA: { icono: ArrowDownCircle, clase: "text-neon-green", label: "ENTRADA" },
  SALIDA: { icono: ArrowUpCircle, clase: "text-red-400", label: "SALIDA" },
  AJUSTE: { icono: Wrench, clase: "text-neon-blue", label: "AJUSTE" },
} as const;

export function KardexHistorial() {
  const [query, setQuery] = useState("");
  const [sugerencias, setSugerencias] = useState<ProductoSugerido[]>([]);
  const [seleccionado, setSeleccionado] = useState<{ codigo: string; descripcion: string } | null>(null);
  const [movimientos, setMovimientos] = useState<KardexMovimiento[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSugerencias([]);
      return;
    }
    try {
      const res = await fetch(`/api/productos/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setSugerencias(await res.json());
    } catch {
      setSugerencias([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscar(query), 250);
    return () => clearTimeout(t);
  }, [query, buscar]);

  const cargarHistorial = useCallback(async (codigo: string) => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(codigo)}/kardex`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo cargar el historial");
        setMovimientos([]);
        return;
      }
      const data = await res.json();
      setMovimientos(data.movimientos ?? []);
      if (data.producto) {
        setSeleccionado({ codigo: data.producto.codigoItem, descripcion: data.producto.descripcion });
      }
    } catch {
      setError("Error de conexión al cargar el historial");
      setMovimientos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex gap-3 items-start">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto para ver su kardex (código, nombre, código de barras)..."
            className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
          />
          <AnimatePresence>
            {sugerencias.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-20 mt-1 w-full bg-surface-800 border border-surface-600 rounded-xl overflow-hidden shadow-xl"
              >
                {sugerencias.map((p) => (
                  <li key={p.codigoItem}>
                    <button
                      onClick={() => {
                        setQuery("");
                        setSugerencias([]);
                        cargarHistorial(p.codigoItem);
                      }}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-700 transition-colors text-left"
                    >
                      <span className="text-gray-100">
                        <span className="font-mono text-neon-green">{p.codigoItem}</span> — {p.descripcion}
                      </span>
                      <span className="text-muted text-xs">stock {p.stockActual}</span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      {cargando && (
        <div className="flex items-center justify-center py-10 text-muted">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando historial...
        </div>
      )}

      {!cargando && seleccionado && (
        <div className="bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-600 flex items-center gap-2">
            <History className="h-4 w-4 text-neon-green" />
            <h3 className="text-sm font-bold text-gray-100">Kardex: {seleccionado.descripcion}</h3>
          </div>
          {movimientos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">
              Sin movimientos registrados para este producto todavía.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-xs uppercase border-b border-surface-600">
                    <th className="px-4 py-2 font-medium">Fecha</th>
                    <th className="px-4 py-2 font-medium">Tipo</th>
                    <th className="px-4 py-2 font-medium text-right">Cambio</th>
                    <th className="px-4 py-2 font-medium">Motivo</th>
                    <th className="px-4 py-2 font-medium">Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => {
                    const cfg = TIPO_ICONO[m.tipo];
                    const Icono = cfg.icono;
                    return (
                      <tr key={m.idMovimiento} className="border-b border-surface-700/50 last:border-0">
                        <td className="px-4 py-2 text-muted whitespace-nowrap">
                          {new Date(m.fecha).toLocaleString("es-MX", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-2">
                          <span className={cn("inline-flex items-center gap-1 text-xs font-bold", cfg.clase)}>
                            <Icono className="h-3.5 w-3.5" /> {cfg.label}
                          </span>
                        </td>
                        <td className={cn("px-4 py-2 text-right font-mono font-bold", m.cantidadCambio > 0 ? "text-neon-green" : "text-red-400")}>
                          {m.cantidadCambio > 0 ? `+${m.cantidadCambio}` : m.cantidadCambio}
                        </td>
                        <td className="px-4 py-2 text-gray-100">{m.motivo}</td>
                        <td className="px-4 py-2 text-muted">{m.usuario}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!cargando && !seleccionado && (
        <p className="text-sm text-muted text-center py-10">
          Selecciona un producto para consultar su historial inmutable de movimientos.
        </p>
      )}
    </motion.div>
  );
}