"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, PackagePlus, Loader2, Barcode } from "lucide-react";
import { useCartStore } from "@/store/cart";

interface ProductoTactil {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  stockActual: number;
  codigoBarras?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ManualSearchModal({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [productos, setProductos] = useState<ProductoTactil[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const addItem = useCartStore((s) => s.addItem);

  const buscar = async (texto: string) => {
    setQuery(texto);
    if (!texto.trim()) {
      setProductos([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/productos?q=${encodeURIComponent(texto)}&limit=30`);
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      setProductos(data.data ?? []);
    } catch {
      setProductos([]);
    } finally {
      setLoading(false);
    }
  };

  const agregar = (p: ProductoTactil) => {
    if (p.stockActual <= 0) return;
    addItem({
      codigoItem: p.codigoItem,
      descripcion: p.descripcion,
      precioUnitario: p.precioUnitario,
      cantidad: 1,
      tipoImpresion: (p as any).tipoImpresion,
    });
  };

  const mostrarStock = useMemo(
    () => productos.filter((p) => p.stockActual > 0),
    [productos]
  );

  useEffect(() => {
    if (open) {
      setResetKey((k) => k + 1);
      setQuery("");
      setProductos([]);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-surface-950/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
<motion.div
              key={resetKey}
            initial={{ scale: 0.92, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 24, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-surface-800 border border-surface-500 rounded-3xl shadow-neon-glow overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-surface-600">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-neon-cyan/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-neon-cyan" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-100">
                    Búsqueda Manual Táctil
                  </h3>
                  <p className="text-xs text-muted">
                    El lector no detectó el código. Agrega el producto tocándolo.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-10 w-10 rounded-xl bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="relative mb-5">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
                <input
                  autoFocus
                  placeholder="Nombre del producto, código de barras o código item..."
                  value={query}
                  onChange={(e) => buscar(e.target.value)}
                  className="w-full bg-surface-700 border border-neon-cyan/40 rounded-2xl pl-12 pr-4 py-4 text-lg text-gray-100 placeholder:text-muted/60 focus:border-neon-cyan focus:shadow-neon-cyan focus:outline-none transition-all"
                />
                {loading && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-neon-cyan animate-spin" />
                )}
              </div>

              {query.trim() && !loading && mostrarStock.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-neon-red/10 flex items-center justify-center">
                    <Barcode className="h-7 w-7 text-neon-red" />
                  </div>
                  <p className="text-muted font-medium">
                    Sin resultados para{" "}
                    <span className="text-gray-100">&quot;{query}&quot;</span>
                  </p>
                  <p className="text-xs text-muted/70">
                    Verifica el código o prueba con el nombre completo.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                  {(mostrarStock.length > 0 ? mostrarStock : productos).map(
                    (p, i) => (
                      <motion.button
                        key={p.codigoItem}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: Math.min(i * 0.03, 0.4),
                          type: "spring",
                          stiffness: 260,
                          damping: 22,
                        }}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => agregar(p)}
                        disabled={p.stockActual <= 0}
                        className="bg-surface-700 hover:bg-surface-600 disabled:opacity-40 border border-surface-500 hover:border-neon-green/50 rounded-2xl p-4 text-left transition-all active:bg-neon-green/10 min-h-[96px] flex flex-col justify-between"
                      >
                        <span className="text-[13px] font-semibold text-gray-100 leading-snug line-clamp-2">
                          {p.descripcion}
                        </span>
                        <span className="mt-3 flex items-baseline justify-between">
                          <span className="text-lg font-black text-neon-green text-glow-green">
                            ${p.precioUnitario.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-muted">
                            {p.stockActual} uds
                          </span>
                        </span>
                      </motion.button>
                    )
                  )}
                  {!query.trim() && !loading && (
                    <div className="col-span-full flex items-center gap-2 justify-center py-6 text-muted text-sm">
                      <PackagePlus className="h-4 w-4" />
                      Escribe para buscar productos
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  className="w-full py-4 rounded-2xl bg-surface-700 hover:bg-surface-600 border border-surface-500 text-gray-200 font-bold text-base transition-colors"
                >
                  Hecho
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}