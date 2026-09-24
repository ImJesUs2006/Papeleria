"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PackagePlus, Star, ShoppingCart, TrendingUp } from "lucide-react";
import { useCartStore } from "@/store/cart";
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
}

// ============================================================
// Catálogo táctil del POS: Top 20 (favoritos + más vendidos + recientes).
// La cajera agrega directo al carrito con un clic, sin lector USB.
// ============================================================

export function ProductGrid() {
  const addItem = useCartStore((s) => s.addItem);
  const [productos, setProductos] = useState<GridProducto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imagenes, setImagenes] = useState<Record<string, string>>({});

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
        const imgs: Record<string, string> = {};
        await Promise.all(
          lista.map(async (p) => {
            try {
              const det = await fetch(`/api/productos/${encodeURIComponent(p.codigoItem)}`);
              if (!det.ok) return;
              const d = await det.json();
              if (d?.imagenBase64) {
                imgs[p.codigoItem] = `data:${d.imagenMime};base64,${d.imagenBase64}`;
                if (viva) setImagenes((prev) => ({ ...prev, [p.codigoItem]: imgs[p.codigoItem] }));
              }
            } catch {
              /* sin imagen */
            }
          })
        );
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
    if (p.stockActual <= 0) return;
    addItem({
      codigoItem: p.codigoItem,
      descripcion: p.descripcion,
      precioUnitario: p.precioUnitario,
      cantidad: 1,
      tipoImpresion: p.tipoImpresion ?? undefined,
    });
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
              disabled={p.stockActual <= 0}
              className={cn(
                "bg-surface-700 border border-surface-500 rounded-xl p-3 text-left transition-colors min-h-[110px] flex flex-col justify-between",
                p.stockActual > 0
                  ? "hover:border-neon-green/50 hover:bg-surface-600"
                  : "opacity-40 cursor-not-allowed"
              )}
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                {imagenes[p.codigoItem] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagenes[p.codigoItem]}
                    alt={p.descripcion}
                    className="h-12 w-12 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-surface-600 flex items-center justify-center shrink-0">
                    <ShoppingCart className="h-5 w-5 text-muted" />
                  </div>
                )}
                {p.favorito && (
                  <span className="flex items-center gap-0.5 text-[10px] text-neon-yellow font-bold shrink-0">
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
                {p.vendidos != null && p.vendidos > 0 && (
                  <span className="text-[10px] text-muted">{p.vendidos} vendidos</span>
                )}
              </span>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}