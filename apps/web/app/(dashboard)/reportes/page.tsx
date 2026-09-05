"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  ScrollText,
  Download,
  BarChart3,
  Trophy,
  CreditCard,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { cn } from "@/lib/utils";

interface ReportDef {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  textClass: string;
  hoverBgClass: string;
  needsDateRange: boolean;
  needsCajaId?: boolean;
}

const REPORT_TYPES: ReportDef[] = [
  {
    id: "inventario",
    label: "Inventario Completo",
    description: "Todos los productos con stock, precios y ubicación",
    icon: Package,
    colorClass: "border-neon-green",
    bgClass: "bg-neon-green/10",
    textClass: "text-neon-green",
    hoverBgClass: "hover:bg-neon-green/20",
    needsDateRange: false,
  },
  {
    id: "reabastecimiento",
    label: "Reabastecimiento",
    description: "Productos bajo stock mínimo - lista para pedir a proveedores",
    icon: AlertTriangle,
    colorClass: "border-neon-yellow",
    bgClass: "bg-neon-yellow/10",
    textClass: "text-neon-yellow",
    hoverBgClass: "hover:bg-neon-yellow/20",
    needsDateRange: false,
  },
  {
    id: "ventas",
    label: "Reporte de Ventas",
    description: "Todas las ventas en un rango de fechas",
    icon: ShoppingCart,
    colorClass: "border-neon-blue",
    bgClass: "bg-neon-blue/10",
    textClass: "text-neon-blue",
    hoverBgClass: "hover:bg-neon-blue/20",
    needsDateRange: true,
  },
  {
    id: "ventas-por-producto",
    label: "Ventas por Producto",
    description: "Ranking de productos por ingreso generado",
    icon: BarChart3,
    colorClass: "border-neon-pink",
    bgClass: "bg-neon-pink/10",
    textClass: "text-neon-pink",
    hoverBgClass: "hover:bg-neon-pink/20",
    needsDateRange: true,
  },
  {
    id: "top-mas-vendidos",
    label: "Top 20 Más Vendidos",
    description: "Los 20 productos más vendidos por cantidad de unidades",
    icon: Trophy,
    colorClass: "border-neon-yellow",
    bgClass: "bg-neon-yellow/10",
    textClass: "text-neon-yellow",
    hoverBgClass: "hover:bg-neon-yellow/20",
    needsDateRange: false,
  },
  {
    id: "cierre-caja",
    label: "Cierre de Caja",
    description: "Desglose de efectivo, digital y recargas de una sesión",
    icon: CreditCard,
    colorClass: "border-neon-green",
    bgClass: "bg-neon-green/10",
    textClass: "text-neon-green",
    hoverBgClass: "hover:bg-neon-green/20",
    needsDateRange: false,
    needsCajaId: true,
  },
  {
    id: "bitacora",
    label: "Bitácora de Auditoría",
    description: "Últimos 5000 registros de actividad del sistema",
    icon: ScrollText,
    colorClass: "border-neon-pink",
    bgClass: "bg-neon-pink/10",
    textClass: "text-neon-pink",
    hoverBgClass: "hover:bg-neon-pink/20",
    needsDateRange: false,
  },
];

export default function ReportesPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async (report: ReportDef) => {
    setIsGenerating(true);
    setSelectedType(report.id);

    try {
      const params = new URLSearchParams({ tipo: report.id });

      if (report.needsDateRange) {
        if (dateFrom) params.set("desde", dateFrom);
        if (dateTo) params.set("hasta", dateTo);
      }

      if (report.needsCajaId) {
        if (!cajaId.trim()) {
          alert("Ingresa el ID de la sesión de caja");
          setIsGenerating(false);
          setSelectedType(null);
          return;
        }
        params.set("idCaja", cajaId.trim());
      }

      const res = await fetch(`/api/reportes?${params.toString()}`);

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        alert(err?.error || "Error al generar reporte");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] || `reporte_${report.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Error de conexión al generar reporte");
    } finally {
      setIsGenerating(false);
      setSelectedType(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-black text-gray-100 mb-1">Reportes</h2>
          <p className="text-sm text-muted">
            Genera archivos Excel automatizados para análisis y pedidos
          </p>
        </motion.div>

        {/* Global date filter */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <ScrollText className="h-4 w-4" />
            <span>Filtros globales:</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:border-neon-blue focus:outline-none"
            />
            <span className="text-muted text-sm">a</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:border-neon-blue focus:outline-none"
            />
          </div>
        </div>

        {/* Report cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {REPORT_TYPES.map((report, i) => {
            const Icon = report.icon;
            const isActive = selectedType === report.id;

            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className={cn(
                  "bg-surface-800 border rounded-2xl p-5 transition-all",
                  isActive ? report.colorClass : "border-surface-600 hover:border-surface-500"
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", report.bgClass)}>
                    <Icon className={cn("h-5 w-5", report.textClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-100 text-sm">{report.label}</h3>
                    <p className="text-xs text-muted leading-tight mt-0.5">{report.description}</p>
                  </div>
                </div>

                {report.needsCajaId && (
                  <div className="mb-3">
                    <label className="text-xs text-muted mb-1 block">ID Sesión de Caja</label>
                    <input
                      type="text"
                      value={cajaId}
                      onChange={(e) => setCajaId(e.target.value)}
                      placeholder="ej: abc-123-def"
                      className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder:text-muted/40 focus:border-neon-green focus:outline-none"
                    />
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleGenerate(report)}
                  disabled={isGenerating}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                    isGenerating && isActive
                      ? "bg-surface-600 text-muted"
                      : cn(report.bgClass, report.textClass, report.hoverBgClass)
                  )}
                >
                  {isGenerating && isActive ? (
                    <>
                      <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      Descargar Excel
                    </>
                  )}
                </motion.button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
