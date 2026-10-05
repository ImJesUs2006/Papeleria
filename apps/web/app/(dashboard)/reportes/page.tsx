"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  ShoppingCart,
  AlertTriangle,
  ScrollText,
  Download,
  BarChart3,
  Trophy,
  CreditCard,
  Eye,
  X,
  UserRound,
  Boxes,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
  ReportsPreviewTable,
  PreviewSkeleton,
  type PreviewData,
} from "@/components/reports/preview-table";
import { BitacoraPreview } from "@/components/reports/bitacora-preview";
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
    textClass: "text-warning",
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
    textClass: "text-warning",
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
    description: "Explora acciones del sistema con paginación remota (50 por página)",
    icon: ScrollText,
    colorClass: "border-neon-pink",
    bgClass: "bg-neon-pink/10",
    textClass: "text-neon-pink",
    hoverBgClass: "hover:bg-neon-pink/20",
    needsDateRange: true,
  },
];

// Módulos del sistema que acepta el reporte de bitácora (mismo catálogo
// que /api/bitacora y lib/reports.ts).
const MODULOS = [
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
] as const;

interface UsuarioFiltro {
  idPersona: string;
  nombre: string;
  username: string | null;
  rol: string | null;
}

// El reporte que consume el filtro de módulo.
const REPORTE_CON_MODULO = "bitacora";

export default function ReportesPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cajaId, setCajaId] = useState("");
  const [usuario, setUsuario] = useState("");
  const [modulo, setModulo] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioFiltro[]>([]);
  const [usuariosCargando, setUsuariosCargando] = useState(true);
  const [usuariosError, setUsuariosError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [bitacoraOpen, setBitacoraOpen] = useState(false);
  // Último reporte Generates: define qué filtros globals son relevantes.
  const [contexto, setContexto] = useState<string | null>(null);
  const moduloDisponible = contexto === REPORTE_CON_MODULO;

  // El selector de usuarios se alimenta del endpoint real ya existente
  // (/api/usuarios). Cualquier fallo degrada a un campo de texto libre
  // —el servidor también acepta nombre o username— sin romper la página.
  const cargarUsuarios = useCallback(async () => {
    setUsuariosCargando(true);
    try {
      const res = await fetch("/api/usuarios");
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "No se pudieron cargar los usuarios");
      const lista = Array.isArray(json?.usuarios) ? json.usuarios : [];
      setUsuarios(
        lista.filter(
          (u: UsuarioFiltro) => u && typeof u.idPersona === "string" && !!u.idPersona
        )
      );
      setUsuariosError(null);
    } catch (e) {
      setUsuarios([]);
      setUsuariosError(
        e instanceof Error ? e.message : "No se pudieron cargar los usuarios"
      );
    } finally {
      setUsuariosCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarUsuarios();
  }, [cargarUsuarios]);

  const buildParams = (report: ReportDef): URLSearchParams | null => {
    const params = new URLSearchParams({ tipo: report.id });
    if (report.needsDateRange) {
      if (dateFrom) params.set("desde", dateFrom);
      if (dateTo) params.set("hasta", dateTo);
    }
    if (report.needsCajaId) {
      if (!cajaId.trim()) {
        alert("Ingresa el ID de la sesión de caja");
        return null;
      }
      params.set("idCaja", cajaId.trim());
    }
    // Filtros avanzados aplicados EN EL SERVIDOR sobre la consulta paginada.
    if (usuario.trim()) params.set("usuario", usuario.trim());
    if (report.id === REPORTE_CON_MODULO && modulo) params.set("modulo", modulo);
    return params;
  };

  const handlePreview = async (report: ReportDef) => {
    // La bitácora usa su propia vista con paginación remota (?page=1&limit=50).
    if (report.id === "bitacora") {
      setSelectedType(report.id);
      setContexto(report.id);
      setBitacoraOpen(true);
      return;
    }
    const params = buildParams(report);
    if (!params) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setSelectedType(report.id);
    setContexto(report.id);
    try {
      const res = await fetch(`/api/reportes/data?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Error al generar vista previa");
      // Toda lectura de la respuesta va con default defensivo: una carga
      // malformada nunca debe romper el modal.
      const filas = Array.isArray(data?.rows) ? data.rows : [];
      setPreviewData({
        title: typeof data?.title === "string" ? data.title : "Vista previa",
        headers: Array.isArray(data?.headers) ? data.headers : [],
        numFmt: Array.isArray(data?.numFmt) ? data.numFmt : [],
        total: Array.isArray(data?.total) ? data.total : [],
        rows: filas.map((f: unknown) => (Array.isArray(f) ? f : [])),
        totalFilas: Number(data?.totalFilas) || filas.length,
        truncado: Boolean(data?.truncado),
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Error al generar vista previa");
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExport = async (report: ReportDef) => {
    const params = buildParams(report);
    if (!params) return;
    setIsGenerating(true);
    setSelectedType(report.id);
    setContexto(report.id);

    try {
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

        {/* Filtros globales: fechas + usuario + módulo (todos server-side) */}
        <div className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <ScrollText className="h-4 w-4" />
            <span>Filtros globales:</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
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

            {/* Filtro por usuario: se aplica en el servidor (id, nombre o username) */}
            <label className="flex items-center gap-2 text-xs text-muted">
              <UserRound className="h-4 w-4 shrink-0" />
              <span>Usuario</span>
              {usuarios.length > 0 ? (
                <select
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  disabled={usuariosCargando}
                  className="bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:border-neon-blue focus:outline-none disabled:opacity-50"
                >
                  <option value="" className="bg-surface-800">
                    Todos
                  </option>
                  {usuarios.map((u) => (
                    <option key={u.idPersona} value={u.idPersona} className="bg-surface-800">
                      {u.nombre}
                      {u.username ? ` (${u.username})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  placeholder="id, nombre o usuario"
                  className="bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-xs text-gray-100 placeholder:text-muted/40 focus:border-neon-blue focus:outline-none"
                />
              )}
            </label>

            {/* Filtro por módulo: sólo la bitácora lo soporta */}
            <label
              className={cn(
                "flex items-center gap-2 text-xs",
                moduloDisponible ? "text-muted" : "text-muted/50"
              )}
              title={
                moduloDisponible
                  ? "Filtra la bitácora por módulo del sistema"
                  : "Sólo aplica a la Bitácora de auditoría"
              }
            >
              <Boxes className="h-4 w-4 shrink-0" />
              <span>Módulo</span>
              <select
                value={modulo}
                onChange={(e) => setModulo(e.target.value)}
                disabled={!moduloDisponible}
                className="bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:border-neon-pink focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <option value="" className="bg-surface-800">
                  {moduloDisponible ? "Todos" : "No aplica"}
                </option>
                {MODULOS.map((m) => (
                  <option key={m} value={m} className="bg-surface-800">
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!moduloDisponible && (
            <p className="mt-2 text-[11px] text-muted/70">
              El filtro de módulo se habilita al generar la Bitácora de auditoría.
            </p>
          )}
          {usuariosError && (
            <p className="mt-2 text-[11px] text-warning">
              No se pudo cargar el catálogo de usuarios ({usuariosError}). Escribe el nombre o
              usuario directamente.
            </p>
          )}
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

                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handlePreview(report)}
                    disabled={previewLoading && isActive}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                      previewLoading && isActive
                        ? "bg-surface-600 text-muted"
                        : "bg-surface-700 text-gray-200 hover:bg-surface-600 border border-surface-500"
                    )}
                  >
                    {previewLoading && isActive ? (
                      <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    Vista previa
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleExport(report)}
                    disabled={isGenerating}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                      isGenerating && isActive
                        ? "bg-surface-600 text-muted"
                        : cn(report.bgClass, report.textClass, report.hoverBgClass)
                    )}
                  >
                    {isGenerating && isActive ? (
                      <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Excel
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Vista previa interactiva en modal */}
        <AnimatePresence>
          {(previewLoading || previewError || previewData) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setPreviewData(null);
                setPreviewError(null);
                setSelectedType(null);
              }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ type: "spring", damping: 26, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-5xl max-h-[88vh] flex flex-col bg-surface-900 border border-surface-600 rounded-2xl overflow-hidden shadow-2xl"
              >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-600 bg-surface-800/80">
                  <Eye className="h-4 w-4 text-neon-blue shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-100 text-sm truncate">
                      Vista previa
                      {selectedType && ` · ${REPORT_TYPES.find((r) => r.id === selectedType)?.label ?? ""}`}
                    </h3>
                    <p className="text-[11px] text-muted">
                      Explora y ordena antes de exportar a Excel
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setPreviewData(null);
                      setPreviewError(null);
                      setSelectedType(null);
                    }}
                    className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
                    title="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto">
                  {previewLoading ? (
                    <div className="p-6">
                      <PreviewSkeleton />
                    </div>
                  ) : previewError ? (
                    <div className="flex items-center gap-3 bg-neon-red/10 border border-neon-red/40 rounded-2xl mx-5 my-4 px-5 py-4 text-sm text-gray-100">
                      <AlertTriangle className="h-5 w-5 text-neon-red shrink-0" />
                      <span className="flex-1">{previewError}</span>
                    </div>
                  ) : previewData ? (
                    <ReportsPreviewTable data={previewData} />
                  ) : null}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <BitacoraPreview
          open={bitacoraOpen}
          onClose={() => {
            setBitacoraOpen(false);
            setSelectedType(null);
          }}
          desde={dateFrom}
          hasta={dateTo}
        />

        <p className="mt-6 text-center text-xs text-muted">
          Usa &quot;Vista previa&quot; en cada tarjeta para explorar los datos en el modal, o
          &quot;Excel&quot; para descargar el archivo.
        </p>
      </div>
    </DashboardLayout>
  );
}
