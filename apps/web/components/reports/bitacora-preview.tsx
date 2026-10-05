"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Eye, Loader2, Search, AlertTriangle, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

interface BitacoraLog {
  idLog: string;
  fechaHora: string;
  moduloSistema: string;
  accion: string;
  usuario: string | null;
  username: string | null;
  rol: string | null;
  jsonPayload: any;
  detallesError: string | null;
  ipOrigen: string | null;
}

interface BitacoraPreviewProps {
  open: boolean;
  onClose: () => void;
  desde?: string;
  hasta?: string;
}

const PAGE_SIZE = 50;

const MODULO_COLORS: Record<string, string> = {
  PUNTO_VENTA: "text-neon-green border-neon-green/40 bg-neon-green/10",
  INVENTARIO: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10",
  CAJA: "text-warning border-neon-yellow/40 bg-neon-yellow/10",
  REPORTES: "text-neon-purple border-neon-purple/40 bg-neon-purple/10",
  CONFIGURACION: "text-gray-300 border-surface-400 bg-surface-600/40",
  BITACORA: "text-neon-magenta border-neon-magenta/40 bg-neon-magenta/10",
  CARGA_MASIVA: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10",
  SEGURIDAD: "text-neon-red border-neon-red/40 bg-neon-red/10",
  SETUP: "text-gray-300 border-surface-400 bg-surface-600/40",
  SYNC: "text-warning border-neon-yellow/40 bg-neon-yellow/10",
};

// ============================================================
// Vista previa de Bitácora con PAGINACIÓN REMOTA (Fase 11).
// Cada página pide al servidor ?page=N&limit=50; nunca se
// descarga el log completo, así la tabla escala a miles de
// registros sin hundir el navegador.
// ============================================================
export function BitacoraPreview({ open, onClose, desde, hasta }: BitacoraPreviewProps) {
  const [logs, setLogs] = useState<BitacoraLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [modulo, setModulo] = useState("TODOS");
  const [usuario, setUsuario] = useState("");

  const MODULOS = [
    "TODOS",
    "PUNTO_VENTA",
    "INVENTARIO",
    "CAJA",
    "REPORTES",
    "CONFIGURACION",
    "BITACORA",
    "CARGA_MASIVA",
    "SEGURIDAD",
    "SETUP",
    "SYNC",
  ];

  const cargar = useCallback(
    async (pagina: number) => {
      if (!open) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("page", String(pagina));
        params.set("limit", String(PAGE_SIZE));
        if (modulo !== "TODOS") params.set("modulo", modulo);
        if (usuario.trim()) params.set("usuario", usuario.trim());
        if (desde) params.set("desde", desde);
        if (hasta) params.set("hasta", hasta);

        const res = await fetch(`/api/bitacora?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al cargar bitácora");
        setLogs(data.data ?? []);
        setTotal(data.total ?? 0);
        setTotalPaginas(data.totalPaginas ?? 1);
        setPage(pagina);
      } catch (e: any) {
        setError(e.message || "Error al cargar bitácora");
        setLogs([]);
        setTotal(0);
        setTotalPaginas(1);
      } finally {
        setLoading(false);
      }
    },
    [open, modulo, usuario, desde, hasta]
  );

  useEffect(() => {
    if (open) {
      setPage(1);
      cargar(1);
    } else {
      setLogs([]);
    }
  }, [open, modulo, usuario, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const irPagina = (destino: number) => {
    const siguiente = Math.min(Math.max(1, destino), totalPaginas);
    if (siguiente !== page) cargar(siguiente);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            className="w-full max-w-5xl max-h-[88vh] flex flex-col bg-surface-900 border border-surface-600 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-600 bg-surface-800/80">
              <ScrollText className="h-4 w-4 text-neon-pink shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-100 text-sm truncate">
                  Bitácora de Auditoría
                </h3>
                <p className="text-[11px] text-muted">
                  Paginación remota: cada página consulta {PAGE_SIZE} registros al servidor
                </p>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
                title="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-surface-600 bg-surface-800/40">
              <label className="flex items-center gap-2 text-xs text-muted">
                <span>Módulo</span>
                <select
                  value={modulo}
                  onChange={(e) => setModulo(e.target.value)}
                  className="bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:border-neon-pink focus:outline-none"
                >
                  {MODULOS.map((m) => (
                    <option key={m} value={m} className="bg-surface-800">
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <Search className="h-3.5 w-3.5" />
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="Filtrar por usuario…"
                  className="bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-xs text-gray-100 placeholder:text-muted/40 focus:border-neon-pink focus:outline-none"
                />
              </label>
              {total > 0 && (
                <span className="ml-auto text-xs text-muted">
                  {total.toLocaleString("es-MX")} registros
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading ? (
                <div className="p-6 flex items-center justify-center gap-2 text-muted text-sm">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Cargando bitácora…
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 bg-neon-red/10 border border-neon-red/40 rounded-2xl mx-5 my-4 px-5 py-4 text-sm text-gray-100">
                  <AlertTriangle className="h-5 w-5 text-neon-red shrink-0" />
                  <span className="flex-1">{error}</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
                  <Eye className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Sin registros para los filtros aplicados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface-700/95 backdrop-blur">
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-surface-500">
                        <th className="px-5 py-3 font-semibold">Fecha / Hora</th>
                        <th className="px-5 py-3 font-semibold">Módulo</th>
                        <th className="px-5 py-3 font-semibold">Acción</th>
                        <th className="px-5 py-3 font-semibold">Usuario</th>
                        <th className="px-5 py-3 font-semibold">Rol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr
                          key={log.idLog}
                          className="border-b border-surface-600 last:border-0 hover:bg-surface-700/40 transition-colors"
                        >
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-muted">
                            {new Date(log.fechaHora).toLocaleDateString("es-MX")}
                            <span className="block text-[11px] text-muted/60">
                              {new Date(log.fechaHora).toLocaleTimeString("es-MX")}
                            </span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border",
                                MODULO_COLORS[log.moduloSistema] ??
                                  "text-gray-300 border-surface-400 bg-surface-600/40"
                              )}
                            >
                              {log.moduloSistema}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-200 min-w-[200px]">
                            {log.accion}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-100 font-medium">
                            {log.usuario ?? "Sistema"}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-xs text-muted">
                            {log.rol ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-surface-600 bg-surface-800/40">
              <button
                onClick={() => irPagina(page - 1)}
                disabled={loading || page <= 1}
                className="px-3.5 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs font-bold text-gray-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-xs text-muted">
                Página {page} de {totalPaginas.toLocaleString("es-MX")}
              </span>
              <button
                onClick={() => irPagina(page + 1)}
                disabled={loading || page >= totalPaginas}
                className="px-3.5 py-2 rounded-lg bg-surface-700 hover:bg-surface-600 text-xs font-bold text-gray-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}