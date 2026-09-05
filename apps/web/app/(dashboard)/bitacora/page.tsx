"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  History,
  Download,
  Filter,
  Loader2,
  Shield,
  User,
  FileSpreadsheet,
  CalendarDays,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { cn } from "@/lib/utils";

interface LogEntry {
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

const MODULOS = [
  "TODOS",
  "PUNTO_VENTA",
  "INVENTARIO",
  "CAJA",
  "REPORTES",
  "CONFIGURACION",
  "BITACORA",
  "CARGA_MASIVA",
] as const;

const MODULO_COLORS: Record<string, string> = {
  PUNTO_VENTA: "text-neon-green border-neon-green/40 bg-neon-green/10",
  INVENTARIO: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10",
  CAJA: "text-neon-yellow border-neon-yellow/40 bg-neon-yellow/10",
  REPORTES: "text-neon-purple border-neon-purple/40 bg-neon-purple/10",
  CONFIGURACION: "text-gray-300 border-surface-400 bg-surface-600/40",
  BITACORA: "text-neon-magenta border-neon-magenta/40 bg-neon-magenta/10",
  CARGA_MASIVA: "text-neon-cyan border-neon-cyan/40 bg-neon-cyan/10",
};

export default function BitacoraPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [modulo, setModulo] = useState<string>("TODOS");
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (modulo !== "TODOS") params.set("modulo", modulo);

      const res = await fetch(`/api/bitacora?${params.toString()}`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      setLogs(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, modulo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const params = new URLSearchParams({ export: "xlsx" });
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (modulo !== "TODOS") params.set("modulo", modulo);

      const res = await fetch(`/api/bitacora?${params.toString()}`);
      if (!res.ok) throw new Error("error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bitacora-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h2 className="text-2xl font-black text-gray-100 mb-1">
            Bitácora de Auditoría
          </h2>
          <p className="text-sm text-muted">
            Registro de acciones del sistema para trazabilidad completa
          </p>
        </motion.div>

        {/* Filtros */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-surface-800 border border-surface-600 rounded-2xl p-4 mb-5"
        >
          <div className="flex items-center gap-2 mb-3 text-muted">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              Filtrar por fechas y módulo
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="block">
              <span className="text-xs text-muted mb-1 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Desde
              </span>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" /> Hasta
              </span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 flex items-center gap-1">
                <Shield className="h-3 w-3" /> Módulo
              </span>
              <select
                value={modulo}
                onChange={(e) => setModulo(e.target.value)}
                className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              >
                {MODULOS.map((m) => (
                  <option key={m} value={m} className="bg-surface-800">
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={cargar}
                className="w-full py-2.5 rounded-xl bg-neon-green text-surface-900 font-bold text-sm shadow-neon hover:brightness-110 transition-all"
              >
                Aplicar filtros
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Tabla */}
        <div className="bg-surface-800 border border-surface-600 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-600">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-neon-magenta" />
              <span className="font-bold text-gray-100">
                Registros{" "}
                <span className="text-muted font-normal">
                  ({logs.length})
                </span>
              </span>
            </div>
            {loading && <Loader2 className="h-4 w-4 text-muted animate-spin" />}
          </div>

          <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted text-sm gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando bitácora...
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted gap-2">
                <FileSpreadsheet className="h-10 w-10 opacity-30" />
                <p className="text-sm">Sin registros para los filtros aplicados</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-700/95 backdrop-blur">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-surface-500">
                    <th className="px-5 py-3 font-semibold">Fecha / Hora</th>
                    <th className="px-5 py-3 font-semibold">Módulo</th>
                    <th className="px-5 py-3 font-semibold">Acción</th>
                    <th className="px-5 py-3 font-semibold">Usuario</th>
                    <th className="px-5 py-3 font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <motion.tr
                      key={log.idLog}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.5) }}
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
                      <td className="px-5 py-3 text-gray-200 min-w-[220px]">
                        {log.accion}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "h-7 w-7 rounded-lg flex items-center justify-center",
                              log.rol === "ADMINISTRADORA"
                                ? "bg-neon-magenta/10"
                                : "bg-surface-600"
                            )}
                          >
                            <User
                              className={cn(
                                "h-3.5 w-3.5",
                                log.rol === "ADMINISTRADORA"
                                  ? "text-neon-magenta"
                                  : "text-muted"
                              )}
                            />
                          </div>
                          <div>
                            <span className="block text-gray-100 font-medium text-xs">
                              {log.usuario ?? "Sistema"}
                            </span>
                            {log.rol && (
                              <span className="block text-[10px] text-muted">
                                {log.rol}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted max-w-[220px] truncate">
                        {log.jsonPayload
                          ? JSON.stringify(log.jsonPayload)
                          : log.detallesError ?? "—"}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Botón flotante de exportación a Excel */}
        <motion.button
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 18 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={exportarExcel}
          disabled={exportando || logs.length === 0}
          className={cn(
            "fixed bottom-6 right-6 z-40 flex items-center gap-2 px-6 py-4 rounded-2xl font-bold text-sm shadow-neon-magenta transition-all",
            logs.length > 0
              ? "bg-neon-magenta text-white"
              : "bg-surface-600 text-muted cursor-not-allowed shadow-none"
          )}
        >
          {exportando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Download className="h-5 w-5" />
          )}
          Exportar filtrados
        </motion.button>
      </div>
    </DashboardLayout>
  );
}