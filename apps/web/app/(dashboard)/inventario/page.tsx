"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  Check,
  X,
  AlertTriangle,
  Download,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Package,
  ChevronLeft,
  ChevronRight,
  Barcode,
  PencilLine,
  Star,
  Plus,
  History,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { QuickEdit } from "@/components/inventario/quick-edit";
import { KardexHistorial } from "@/components/inventario/kardex-historial";
import {
  ProductFormModal,
  type ProductFormData,
} from "@/components/inventario/product-form";
import { ErrorBoundary } from "@/components/error-boundary";
import { useLabelModal } from "@/components/inventario/label-modal";
import { cn } from "@/lib/utils";

interface Product {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  precioCompra?: number | null;
  stockActual: number;
  stockMinimo: number;
  ubicacionEstante: string | null;
  proveedor: string | null;
  tipoImpresion: string | null;
  codigoBarras?: string | null;
  favorito?: boolean;
}

interface UploadResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

type SortField = "descripcion" | "precioUnitario" | "stockActual" | "fechaCreacion" | "ubicacionEstante" | "proveedor";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "descripcion", label: "Nombre" },
  { value: "precioUnitario", label: "Precio" },
  { value: "stockActual", label: "Stock" },
  { value: "fechaCreacion", label: "Fecha" },
  { value: "ubicacionEstante", label: "Ubicación" },
  { value: "proveedor", label: "Proveedor" },
];

export default function InventarioPage() {
  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<"buscar" | "cargar" | "editar" | "historial">("buscar");
  const { setEtiqueta, node: labelNode } = useLabelModal();

  // Alta/edición manual de productos
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductFormData | null>(null);

  // Inventory browsing state
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("descripcion");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterProveedor, setFilterProveedor] = useState("");
  const [filterUbicacion, setFilterUbicacion] = useState("");
  const [filterPrecioMin, setFilterPrecioMin] = useState("");
  const [filterPrecioMax, setFilterPrecioMax] = useState("");
  const [filterStockMin, setFilterStockMin] = useState("");
  const [filterStockMax, setFilterStockMax] = useState("");
  const [filterBajoStock, setFilterBajoStock] = useState(false);
  const [filterSinStock, setFilterSinStock] = useState(false);

  const fetchProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      params.set("page", String(page));
      params.set("limit", "25");

      if (filterProveedor) params.set("proveedor", filterProveedor);
      if (filterUbicacion) params.set("ubicacion", filterUbicacion);
      if (filterPrecioMin) params.set("precioMin", filterPrecioMin);
      if (filterPrecioMax) params.set("precioMax", filterPrecioMax);
      if (filterStockMin) params.set("stockMin", filterStockMin);
      if (filterStockMax) params.set("stockMax", filterStockMax);
      if (filterBajoStock) params.set("bajoStock", "true");
      if (filterSinStock) params.set("sinStock", "true");

      const res = await fetch(`/api/productos?${params.toString()}`);
      if (!res.ok) throw new Error("Error fetching");
      const data = await res.json();
      setProducts(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch {
      setProducts([]);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [searchQuery, sortBy, sortDir, page, filterProveedor, filterUbicacion, filterPrecioMin, filterPrecioMax, filterStockMin, filterStockMax, filterBajoStock, filterSinStock]);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(), 300);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  // Marcar/desmarcar favorito (aparece en el catálogo táctil del POS).
  const toggleFavorito = async (p: Product) => {
    const proximo = !p.favorito;
    setProducts((prev) =>
      prev.map((x) => (x.codigoItem === p.codigoItem ? { ...x, favorito: proximo } : x))
    );
    try {
      await fetch(`/api/productos/${encodeURIComponent(p.codigoItem)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorito: proximo }),
      });
    } catch {
      setProducts((prev) =>
        prev.map((x) =>
          x.codigoItem === p.codigoItem ? { ...x, favorito: !proximo } : x
        )
      );
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  const clearFilters = () => {
    setFilterProveedor("");
    setFilterUbicacion("");
    setFilterPrecioMin("");
    setFilterPrecioMax("");
    setFilterStockMin("");
    setFilterStockMax("");
    setFilterBajoStock(false);
    setFilterSinStock(false);
    setSearchQuery("");
    setPage(1);
  };

  const hasActiveFilters = filterProveedor || filterUbicacion || filterPrecioMin || filterPrecioMax || filterStockMin || filterStockMax || filterBajoStock || filterSinStock;

  // Upload handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".csv"))) {
      setUploadedFile(file);
      processFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      processFile(file);
    }
  }, []);

  const processFile = async (file: File) => {
    setIsUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/inventario/carga-masiva", { method: "POST", body: formData });
      const result: UploadResult = await res.json();
      setUploadResult(result);
      if (result.successCount > 0) fetchProducts();
    } catch {
      setUploadResult({ totalRows: 0, successCount: 0, errorCount: 1, errors: [{ row: 0, field: "file", message: "Error al procesar archivo" }] });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-gray-100 mb-1">Inventario</h2>
            <p className="text-sm text-muted">Carga masiva de productos, búsqueda avanzada y gestión de stock</p>
          </div>
          <button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neon-green text-btn-ink font-bold text-sm shadow-neon shrink-0"
          >
            <Plus className="h-4 w-4" /> Nuevo producto
          </button>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-surface-800 p-1 rounded-xl w-fit">
          {(["buscar", "editar", "cargar", "historial"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab ? "bg-surface-600 text-gray-100" : "text-muted hover:text-gray-100"
              )}
            >
              {tab === "buscar" && (
                <>
                  <Search className="h-3.5 w-3.5" /> Buscar
                </>
              )}
              {tab === "editar" && (
                <>
                  <PencilLine className="h-3.5 w-3.5" /> Edición Rápida
                </>
              )}
              {tab === "cargar" && (
                <>
                  <Upload className="h-3.5 w-3.5" /> Carga Masiva
                </>
              )}
              {tab === "historial" && (
                <>
                  <History className="h-3.5 w-3.5" /> Historial
                </>
              )}
            </button>
          ))}
        </div>

        {activeTab === "editar" && <QuickEdit />}

        {activeTab === "historial" && <KardexHistorial />}

        {activeTab === "buscar" ? (
          <div className="space-y-4 mb-8">
          {/* Search bar + sort controls */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="Buscar por código, nombre, proveedor, ubicación..."
                className="w-full bg-surface-800 border border-surface-600 rounded-xl pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder:text-muted/50 focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all",
                showFilters || hasActiveFilters
                  ? "bg-neon-blue/10 border-neon-blue/30 text-neon-blue"
                  : "bg-surface-800 border-surface-600 text-muted hover:text-gray-100"
              )}
            >
              <Filter className="h-4 w-4" />
              Filtros
              {hasActiveFilters && (
                <span className="h-4 w-4 rounded-full bg-neon-blue text-btn-ink text-[10px] font-bold flex items-center justify-center">
                  {[filterProveedor, filterUbicacion, filterPrecioMin, filterPrecioMax, filterStockMin, filterStockMax, filterBajoStock, filterSinStock].filter(Boolean).length}
                </span>
              )}
            </button>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value as SortField); setPage(1); }}
              className="bg-surface-800 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>Ordenar: {opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="bg-surface-800 border border-surface-600 rounded-xl px-3 py-2.5 text-muted hover:text-gray-100 transition-colors"
            >
              {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Filter panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-surface-800 border border-surface-600 rounded-xl p-4 grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Proveedor</label>
                    <input value={filterProveedor} onChange={(e) => { setFilterProveedor(e.target.value); setPage(1); }} placeholder="Filtrar..." className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Ubicación</label>
                    <input value={filterUbicacion} onChange={(e) => { setFilterUbicacion(e.target.value); setPage(1); }} placeholder="Ej: Estante A-1" className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Precio ($)</label>
                    <div className="flex gap-2">
                      <input type="number" value={filterPrecioMin} onChange={(e) => { setFilterPrecioMin(e.target.value); setPage(1); }} placeholder="Min" className="w-1/2 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none" />
                      <input type="number" value={filterPrecioMax} onChange={(e) => { setFilterPrecioMax(e.target.value); setPage(1); }} placeholder="Max" className="w-1/2 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Stock</label>
                    <div className="flex gap-2">
                      <input type="number" value={filterStockMin} onChange={(e) => { setFilterStockMin(e.target.value); setPage(1); }} placeholder="Min" className="w-1/2 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none" />
                      <input type="number" value={filterStockMax} onChange={(e) => { setFilterStockMax(e.target.value); setPage(1); }} placeholder="Max" className="w-1/2 bg-surface-700 border border-surface-500 rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:border-neon-green focus:outline-none" />
                    </div>
                  </div>
                  <div className="col-span-4 flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                      <input type="checkbox" checked={filterBajoStock} onChange={(e) => { setFilterBajoStock(e.target.checked); setPage(1); }} className="rounded" />
                      Solo bajo stock mínimo
                    </label>
                    <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                      <input type="checkbox" checked={filterSinStock} onChange={(e) => { setFilterSinStock(e.target.checked); setPage(1); }} className="rounded" />
                      Sin stock (agotados)
                    </label>
                    {hasActiveFilters && (
                      <button onClick={clearFilters} className="ml-auto text-xs text-neon-red hover:text-neon-red/80 transition-colors">
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results info */}
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{total} productos encontrados</span>
            <span>Página {page} de {totalPages}</span>
          </div>

          {/* Products table */}
          <div className="bg-surface-800 border border-surface-600 rounded-xl overflow-hidden">
            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted">
                <Package className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No se encontraron productos</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-600">
                    {[
                      { field: "descripcion" as SortField, label: "Producto" },
                      { field: "precioUnitario" as SortField, label: "Precio" },
                      { field: "stockActual" as SortField, label: "Stock" },
                      { field: "ubicacionEstante" as SortField, label: "Ubicación" },
                      { field: "proveedor" as SortField, label: "Proveedor" },
                    ].map(({ field, label }) => (
                      <th
                        key={field}
                        onClick={() => toggleSort(field)}
                        className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider cursor-pointer hover:text-gray-100 transition-colors select-none"
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          {sortBy === field && (
                            sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                      Etiqueta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.codigoItem} className="border-b border-surface-700 hover:bg-surface-700/50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-sm font-medium text-gray-100">{p.descripcion}</span>
                          <span className="text-xs text-muted ml-2">{p.codigoItem}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-neon-green font-bold">
                        ${p.precioUnitario.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "text-sm font-bold px-2 py-0.5 rounded-md",
                          p.stockActual <= 0 ? "bg-neon-red/10 text-neon-red" :
                          p.stockActual <= p.stockMinimo ? "bg-neon-yellow/10 text-neon-yellow" :
                          "text-gray-100"
                        )}>
                          {p.stockActual}
                        </span>
                        {p.stockActual <= p.stockMinimo && p.stockActual > 0 && (
                          <span className="text-[10px] text-neon-yellow ml-2">MIN: {p.stockMinimo}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{p.ubicacionEstante || "—"}</td>
                      <td className="px-4 py-3 text-sm text-muted">{p.proveedor || "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleFavorito(p)}
                            aria-label={p.favorito ? "Quitar de favoritos" : "Marcar como favorito"}
                            title={p.favorito ? "Quitar de favoritos" : "Marcar como favorito"}
                            className={cn(
                              "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                              p.favorito
                                ? "bg-neon-yellow/10 text-neon-yellow"
                                : "bg-surface-700 hover:bg-neon-yellow/10 text-muted hover:text-neon-yellow"
                            )}
                          >
                            <Star className={cn("h-4 w-4", p.favorito && "fill-neon-yellow")} />
                          </button>
                          <button
                            onClick={() => { setEditing(p); setFormOpen(true); }}
                            className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-green/10 flex items-center justify-center text-muted hover:text-neon-green transition-colors"
                            title="Editar producto"
                          >
                            <PencilLine className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              setEtiqueta({
                                codigoItem: p.codigoItem,
                                descripcion: p.descripcion,
                                precioUnitario: p.precioUnitario,
                                codigoBarras: p.codigoBarras,
                              })
                            }
                            className="h-8 w-8 rounded-lg bg-surface-700 hover:bg-neon-cyan/10 flex items-center justify-center text-muted hover:text-neon-cyan transition-colors"
                            title="Generar etiqueta QR/barras"
                          >
                            <Barcode className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg bg-surface-800 border border-surface-600 text-muted hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const pageNum = start + i;
                if (pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                      pageNum === page ? "bg-neon-green text-btn-ink" : "bg-surface-800 border border-surface-600 text-muted hover:text-gray-100"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg bg-surface-800 border border-surface-600 text-muted hover:text-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        ) : (

        <div>
        {/* === BULK UPLOAD TAB === */}
          <h3 className="text-lg font-bold text-gray-100 mb-4">Carga Masiva</h3>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300",
                isDragging ? "border-neon-green bg-neon-green/5 shadow-neon" : "border-surface-500 bg-surface-800 hover:border-surface-400"
              )}
            >
              <input type="file" accept=".xlsx,.csv" onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <motion.div animate={isDragging ? { scale: 1.05, y: -5 } : { scale: 1, y: 0 }} transition={{ type: "spring", damping: 15 }}>
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <div className="h-14 w-14 border-4 border-neon-green border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-lg font-bold text-gray-100">Procesando productos...</p>
                  </div>
                ) : uploadedFile ? (
                  <div className="flex flex-col items-center">
                    <FileSpreadsheet className="h-14 w-14 text-neon-green mb-3" />
                    <p className="text-lg font-bold text-gray-100">{uploadedFile.name}</p>
                    <p className="text-sm text-muted mt-1">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="h-14 w-14 text-muted mb-3" />
                    <p className="text-lg font-bold text-gray-100 mb-1">Arrastra tu archivo Excel aquí</p>
                    <p className="text-sm text-muted">o haz clic para seleccionar &middot; .xlsx, .csv</p>
                  </div>
                )}
              </motion.div>
            </div>
            <div className="mt-2 flex justify-end">
              <a href="/templates/inventario-plantilla.xlsx" className="flex items-center gap-2 text-sm text-muted hover:text-neon-blue transition-colors">
                <Download className="h-4 w-4" />
                Descargar plantilla
              </a>
            </div>
          </motion.div>

          {/* Upload result */}
          <AnimatePresence>
            {uploadResult && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 bg-surface-800 border border-surface-600 rounded-2xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  {uploadResult.errorCount === 0 ? (
                    <div className="h-9 w-9 rounded-lg bg-neon-green/10 flex items-center justify-center">
                      <Check className="h-5 w-5 text-neon-green" />
                    </div>
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-neon-yellow/10 flex items-center justify-center">
                      <AlertTriangle className="h-5 w-5 text-neon-yellow" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-gray-100 text-sm">Resultado de carga</h3>
                    <p className="text-xs text-muted">{uploadResult.successCount} de {uploadResult.totalRows} productos cargados</p>
                  </div>
                </div>
                {uploadResult.errors.length > 0 && (
                  <div className="mt-3 max-h-40 overflow-y-auto space-y-1">
                    {uploadResult.errors.map((err, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-neon-red/5 rounded-lg px-3 py-1.5">
                        <X className="h-3 w-3 text-neon-red flex-shrink-0" />
                        <span className="text-muted">Fila {err.row} &middot; {err.field}:</span>
                        <span className="text-gray-100">{err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => { setUploadResult(null); setUploadedFile(null); }} className="mt-3 text-xs text-muted hover:text-gray-100 transition-colors">
                  Cargar otro archivo
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        )}

        {labelNode}

        <ProductFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={() => fetchProducts()}
          producto={editing}
        />
      </div>
    </DashboardLayout>
  );
}
