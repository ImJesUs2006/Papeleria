"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { BarcodeScanner } from "@/components/pos/barcode-scanner";
import { CartPanel } from "@/components/pos/cart-panel";
import { ProductGrid } from "@/components/pos/product-grid";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";

interface ProductoRapido {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  stockActual: number;
}

export default function CobroPage() {
  const addItem = useCartStore((s) => s.addItem);
  const [codigoError, setCodigoError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  const manejarScan = async (codigo: string) => {
    setCodigoError(null);
    setBuscando(true);
    try {
      const res = await fetch(
        `/api/productos?q=${encodeURIComponent(codigo)}&limit=5`
      );
      if (!res.ok) throw new Error("error");
      const data = await res.json();
      const match: ProductoRapido[] = (data.data ?? []).filter(
        (p: ProductoRapido) => p.stockActual > 0
      );
      if (match.length === 0) {
        setCodigoError(
          `Código "${codigo}" no encontrado o sin stock disponible`
        );
        return;
      }
      const p = match[0];
      addItem({
        codigoItem: p.codigoItem,
        descripcion: p.descripcion,
        precioUnitario: p.precioUnitario,
        cantidad: 1,
      });
    } catch {
      setCodigoError("No se pudo conectar con el servidor");
    } finally {
      setBuscando(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-1 h-full">
        {/* Left: Scanner + catálogo visual */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h2 className="text-2xl font-black text-gray-100 mb-1">
              Punto de Venta
            </h2>
            <p className="text-sm text-muted">
              Escanea, busca manualmente o toca una tarjeta del catálogo
            </p>
          </motion.div>

          <BarcodeScanner onScan={manejarScan} codigoError={codigoError} />

          {/* Error de código no encontrado */}
          <AnimatePresence>
            {codigoError && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 flex items-start gap-3 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-3"
              >
                <AlertTriangle className="h-5 w-5 text-neon-red shrink-0 mt-0.5" />
                <p className="text-sm text-gray-100 flex-1">{codigoError}</p>
                <button
                  onClick={() => setCodigoError(null)}
                  className="text-xs text-muted hover:text-gray-100 shrink-0"
                >
                  Cerrar
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Catálogo táctil por defecto: Top 20 favoritos / más vendidos */}
          {buscando ? (
            <div className="mt-6 text-sm text-muted">Buscando…</div>
          ) : (
            <ProductGrid />
          )}
        </div>

        {/* Right: Cart panel */}
        <div className={cn("w-96 shrink-0 bg-surface-800 border-l border-surface-600 flex flex-col")}>
          <CartPanel />
        </div>
      </div>
    </DashboardLayout>
  );
}