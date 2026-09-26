"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  Receipt,
  PackageX,
  AlertTriangle,
  Clock,
  PieChart as PieIcon,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { cn } from "@/lib/utils";

interface DashboardData {
  resumen: { totalVentas: number; numVentas: number; ticketPromedio: number; agotados: number; alertaBaja: number };
  ventasPorHora: Array<{ hora: string; monto: number; ventas: number }>;
  topProductos: Array<{ descripcion: string; cantidad: number; monto: number }>;
  alertasStock: Array<{ descripcion: string; stockActual: number; stockMinimo: number }>;
  caja: { fondoInicial: number; totalVentasEfectivo: number; totalVentasDigital: number; totalRecargas: number } | null;
}

const PIE_COLORS = ["#00ff88", "#00d4ff", "#ff0080"];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error("error");
        return r.json();
      })
      .then(setData)
      .catch(() => setError("No se pudieron cargar las métricas"));
  }, []);

  const pieData = data
    ? [
        { name: "Agotados", value: data.resumen.agotados },
        { name: "Bajo stock", value: data.resumen.alertaBaja },
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h2 className="text-2xl font-black text-gray-100 mb-1">Dashboard</h2>
          <p className="text-sm text-muted">Métricas y tendencias del negocio (últimos 30 días)</p>
        </motion.div>

        {error && !data && (
          <div className="flex flex-col items-center justify-center py-20 text-muted gap-2">
            <AlertTriangle className="h-10 w-10 opacity-40" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!data && !error && (
          <div className="flex items-center justify-center py-20 text-muted gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Generando métricas...
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Ventas totales", value: `$${data.resumen.totalVentas.toFixed(2)}`, icon: TrendingUp, color: "text-neon-green", bg: "bg-neon-green/10" },
                { label: "Tickets emitidos", value: String(data.resumen.numVentas), icon: Receipt, color: "text-neon-cyan", bg: "bg-neon-cyan/10" },
                { label: "Ticket promedio", value: `$${data.resumen.ticketPromedio.toFixed(2)}`, icon: BarChart3, color: "text-neon-magenta", bg: "bg-neon-magenta/10" },
                { label: "Alertas de stock", value: String(data.resumen.agotados + data.resumen.alertaBaja), icon: PackageX, color: "text-warning", bg: "bg-neon-yellow/10" },
              ].map((kpi, i) => (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07 }}
                  className="bg-surface-800 border border-surface-600 rounded-2xl p-5"
                >
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center mb-3", kpi.bg)}>
                    <kpi.icon className={cn("h-5 w-5", kpi.color)} />
                  </div>
                  <p className="text-2xl font-black text-gray-100">{kpi.value}</p>
                  <p className="text-xs text-muted mt-0.5">{kpi.label}</p>
                </motion.div>
              ))}
            </div>

            {/* Caja actual */}
            {data.caja && (
              <div className="flex flex-wrap gap-6 bg-surface-800 border border-surface-600 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-xs text-muted uppercase tracking-wider self-center"><Clock className="h-4 w-4 text-neon-green" /> Caja abierta</div>
                <div><p className="text-[10px] text-muted uppercase">Fondo</p><p className="text-sm font-bold text-gray-100">${data.caja.fondoInicial.toFixed(2)}</p></div>
                <div><p className="text-[10px] text-neon-green uppercase">Papelería</p><p className="text-sm font-bold text-neon-green">${data.caja.totalVentasEfectivo.toFixed(2)}</p></div>
                <div><p className="text-[10px] text-neon-cyan uppercase">Digital</p><p className="text-sm font-bold text-neon-cyan">${data.caja.totalVentasDigital.toFixed(2)}</p></div>
                <div><p className="text-[10px] text-neon-magenta uppercase">Recargas</p><p className="text-sm font-bold text-neon-magenta">${data.caja.totalRecargas.toFixed(2)}</p></div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Ventas por hora */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="lg:col-span-2 bg-surface-800 border border-surface-600 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-neon-cyan" />
                  <h3 className="font-bold text-gray-100">Picos de ventas por horario</h3>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.ventasPorHora} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradMarca" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--marca-color)" stopOpacity={0.9} />
                          <stop offset="100%" stopColor="var(--marca-color)" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" />
                      <XAxis dataKey="hora" tick={{ fill: "#9ca3af", fontSize: 10 }} interval={3} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: "#111111", border: "1px solid #333", borderRadius: 12, color: "#f3f4f6" }}
                        labelStyle={{ color: "#00d4ff", fontWeight: 700 }}
                        formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Monto"]}
                      />
                      <Bar dataKey="monto" fill="url(#gradMarca)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              {/* Alertas de stock */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="bg-surface-800 border border-surface-600 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <PieIcon className="h-5 w-5 text-warning" />
                  <h3 className="font-bold text-gray-100">Inventario crítico</h3>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={65} paddingAngle={4}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#111111", border: "1px solid #333", borderRadius: 12, color: "#f3f4f6" }} />
                      <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto">
                  {data.alertasStock.slice(0, 6).map((a) => (
                    <div key={a.descripcion} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-muted truncate">{a.descripcion}</span>
                      <span className={cn("font-bold shrink-0", a.stockActual === 0 ? "text-neon-red" : "text-warning")}>
                        {a.stockActual} / mín {a.stockMinimo}
                      </span>
                    </div>
                  ))}
                  {data.alertasStock.length === 0 && (
                    <p className="text-xs text-muted text-center py-6">Sin alertas de stock</p>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Top 5 productos */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="bg-surface-800 border border-surface-600 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-neon-green" />
                <h3 className="font-bold text-gray-100">Top 5 productos más vendidos</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.topProductos} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradMarcaH" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--marca-color)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--marca-color)" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis type="category" dataKey="descripcion" width={170} tick={{ fill: "#e5e7eb", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#111111", border: "1px solid #333", borderRadius: 12, color: "#f3f4f6" }}
                      formatter={(v: any) => [`${v} uds`, "Cantidad"]}
                    />
                    <Bar dataKey="cantidad" fill="url(#gradMarcaH)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}