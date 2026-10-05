"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PackagePlus, Star, ShoppingCart, TrendingUp } from "lucide-react";
import { useCartStore } from "@/store/cart";
import { usePosFeedback } from "@/store/pos-feedback";
import { cn } from "@/lib/utils";

interface GridProducto {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  stockActual: number;
  tipoImpresion?: string | null;
  codigoBarras?: string | null;
  favorito?: boolean;
  vendidos?: number;
  /** Fase 10: se vende a granel (fracciones). */
  permiteDecimales?: boolean;
  /** Fase 10: servicio puro, disponible sin importar el stock. */
  esServicio?: boolean;
  /** Fase 12: precio de mayoreo (null si el producto no lo tiene). */
  precioMayoreo?: number | null;
  /** Fase 12: imagen del producto en Cloudinary. */
  imagenUrl?: string | null;
}

// ============================================================
// Catálogo táctil del POS: Top 20 (favoritos + más vendidos + recientes).
// La cajera agrega directo al carrito con un clic, sin lector USB.
// ============================================================

export function ProductGrid() {
  const addItem = useCartStore((s) => s.addItem);
  const pushToast = usePosFeedback((s) => s.push);
  const [productos, setProductos] = useState<GridProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viva = true;
    (async () => {
      try {
        const res = await fetch("/api/productos/top?limit=20", { cache: "no-store" });
        if (!res.ok) throw new Error("error");
        const data = await res.json();
        const lista: GridProducto[] = data.data ?? [];
        if (!viva) return;
        setProductos(lista);
      } catch {
        if (viva) setError("No se pudo cargar el catálogo");
      } finally {
        if (viva) setLoading(false);
      }
    })();
    return () => {
      viva = false;
    };
  }, []);

  const agregar = (p: GridProducto) => {
    // Un servicio está siempre disponible (no hay inventario que validar).
    if (!p.esServicio && p.stockActual <= 0) return;
    addItem({
      codigoItem: p.codigoItem,
      descripcion: p.descripcion,
      precioUnitario: p.precioUnitario,
      cantidad: 1,
      tipoImpresion: p.tipoImpresion ?? undefined,
      permiteDecimales: p.permiteDecimales,
      esServicio: p.esServicio,
      // Fase 12: mayoreo e imagen viajan al carrito (el store decide el precio).
      precioMayoreo: p.precioMayoreo ?? null,
      imagenUrl: p.imagenUrl ?? null,
      tasaIva: (p as any).tasaIva ?? null,
      exentoIva: (p as any).exentoIva === true,
      tasaIeps: (p as any).tasaIeps ?? null,
    });
    // Fase 12: feedback instantáneo al tocar una tarjeta del catálogo.
    pushToast(`Producto ${p.descripcion} agregado`);
  };

  if (loading) {
    return (
      <div data-testid="product-grid" className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-muted uppercase tracking-wider">
            Catálogo rápido
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl bg-surface-700/70 border border-surface-500 animate-pulse h-28"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="product-grid" className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-muted uppercase tracking-wider flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-neon-cyan" />
          Catálogo rápido · Top ventas y favoritos
        </h3>
        <span className="text-xs text-muted">{productos.length} productos</span>
      </div>

      {error ? (
        <div className="col-span-full flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-neon-red/40 text-muted text-sm">
          <PackagePlus className="h-8 w-8 mb-2 opacity-40" />
          {error} — recarga la página o escanea un código.
        </div>
      ) : productos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-surface-500 text-muted text-sm">
          <PackagePlus className="h-8 w-8 mb-2 opacity-40" />
          Escanea un código para ver el producto aquí
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {productos.map((p, i) => (
            <motion.button
              key={p.codigoItem}
              data-testid="product-card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: Math.min(i * 0.04, 0.4),
                type: "spring",
                stiffness: 260,
                damping: 22,
              }}
              whileTap={{ scale: 0.94 }}
              onClick={() => agregar(p)}
              disabled={!p.esServicio && p.stockActual <= 0}
              className={cn(
                "bg-surface-700 border border-surface-500 rounded-xl p-3 text-left transition-colors min-h-[110px] flex flex-col justify-between",
                !p.esServicio && p.stockActual > 0
                  ? "hover:border-neon-green/50 hover:bg-surface-600"
                  : p.esServicio
                    ? "hover:border-neon-purple/50 hover:bg-surface-600"
                    : "opacity-40 cursor-not-allowed"
              )}
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                <div className="h-12 w-12 rounded-lg bg-surface-600 flex items-center justify-center shrink-0 overflow-hidden">
                  {/* Fase 12: imagen del producto (Cloudinary) con fallback */}
                  {p.imagenUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imagenUrl}
                      alt={p.descripcion}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <ShoppingCart className="h-5 w-5 text-muted" />
                  )}
                </div>
                {p.favorito && (
                  <span className="flex items-center gap-0.5 text-[10px] text-warning font-bold shrink-0">
                    <Star className="h-3 w-3 fill-neon-yellow" /> Fav
                  </span>
                )}
              </div>
              <span className="text-[13px] font-medium text-gray-100 line-clamp-2 leading-snug">
                {p.descripcion}
              </span>
              <span className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-black text-neon-green text-glow-green">
                  ${p.precioUnitario.toFixed(2)}
                </span>
                {p.esServicio ? (
                  <span className="text-[10px] font-bold text-neon-purple border border-neon-purple/40 rounded px-1 py-0.5 shrink-0">
                    Servicio
                  </span>
                ) : Number(p.precioMayoreo) > 0 ? (
                  <span className="text-[10px] font-bold text-teal-300 border border-teal-500/40 rounded px-1 py-0.5 shrink-0">
                    Mayoreo
                  </span>
                ) : p.permiteDecimales ? (
                  <span className="text-[10px] font-bold text-neon-cyan border border-neon-cyan/40 rounded px-1 py-0.5 shrink-0">
                    Granel
                  </span>
                ) : p.vendidos != null && p.vendidos > 0 ? (
                  <span className="text-[10px] text-muted">{p.vendidos} vendidos</span>
                ) : null}
              </span>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}