"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScanLine, AlertTriangle, Keyboard, RefreshCw } from "lucide-react";
import { useScannerDetection } from "@/hooks/use-scanner";
import { ManualSearchModal } from "@/components/pos/manual-search-modal";
import { cn } from "@/lib/utils";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  codigoError: string | null;
  className?: string;
}

export function BarcodeScanner({
  onScan,
  codigoError,
  className,
}: BarcodeScannerProps) {
  const [manualOpen, setManualOpen] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const lastFailRef = useRef<number>(0);

  const handleScanFail = () => {
    // Evita re-disparar el modal en ráfagas fallidas consecutivas
    const now = Date.now();
    if (now - lastFailRef.current < 2500) return;
    lastFailRef.current = now;
    setShowFallback(true);
    // La búsqueda manual se abre sola si el escaneo falla
    setManualOpen(true);
  };

  const { inputRef, isScannerInput, scannerHealth, isFocused, focusInput } =
    useScannerDetection(onScan, handleScanFail);

  return (
    <div className={cn("relative", className)}>
      {/* Input fantasma que captura las ráfagas del lector USB */}
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        className="absolute -left-[9999px] top-0 h-px w-px opacity-0 pointer-events-none"
        aria-hidden="true"
        tabIndex={-1}
      />

      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          focusInput();
          setManualOpen(true);
        }}
        className={cn(
          "w-full bg-surface-700 border-2 rounded-2xl px-5 py-6 flex items-center gap-4 text-left transition-colors",
          isFocused
            ? "border-neon-green/60 shadow-neon"
            : "border-surface-500 border-dashed"
        )}
      >
        <div
          className={cn(
            "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
            isScannerInput ? "bg-neon-green/20" : "bg-surface-600"
          )}
        >
          <ScanLine
            className={cn(
              "h-6 w-6",
              isScannerInput ? "text-neon-green animate-pulse" : "text-muted"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-100 text-sm">
            Enfoca tu lector al código de barras
          </p>
          <p className="text-xs text-muted mt-0.5">
            Escanea o toca para buscar manualmente
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              scannerHealth === "online"
                ? "bg-neon-green animate-pulse"
                : "bg-neon-yellow/70"
            )}
            title={scannerHealth === "online" ? "Lector activo" : "Lector en espera"}
          />
          <span className="text-[11px] font-medium text-muted hidden sm:inline">
            {scannerHealth === "online" ? "Lector OK" : "Esperando lector"}
          </span>
        </div>
      </motion.button>

      {/* Banner de falla del escaneo (animación de sacudida) */}
      <AnimatePresence>
        {showFallback && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="overflow-hidden"
          >
            <motion.div
              animate={{ x: [0, -6, 6, -4, 4, 0] }}
              transition={{ duration: 0.4 }}
              className="mt-3 flex items-center gap-3 bg-neon-yellow/10 border border-neon-yellow/40 rounded-xl px-4 py-3"
            >
              <AlertTriangle className="h-5 w-5 text-neon-yellow shrink-0" />
              <p className="text-sm text-gray-100 flex-1">
                No se detectó el código. Revisa la conexión del lector o usa la
                búsqueda táctil.
              </p>
              <button
                onClick={() => setManualOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neon-yellow text-surface-900 font-bold text-xs shrink-0"
              >
                <Keyboard className="h-4 w-4" />
                Abrir
              </button>
              <button
                onClick={() => setShowFallback(false)}
                className="text-muted hover:text-gray-100 shrink-0"
                aria-label="Descartar"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de búsqueda manual táctil */}
      <ManualSearchModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </div>
  );
}