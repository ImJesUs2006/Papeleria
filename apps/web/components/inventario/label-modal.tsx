"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import JsBarcode from "jsbarcode";
import { QRCodeSVG } from "qrcode.react";
import { X, Printer, Copy, Check, QrCode, Barcode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LabelProduct {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  codigoBarras?: string | null;
}

interface Props {
  product: LabelProduct | null;
  onClose: () => void;
}

export function LabelModal({ product, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [copiando, setCopiando] = useState(false);

  useEffect(() => {
    if (!product) return;
    setCopiado(false);
    const value = product.codigoBarras || product.codigoItem;
    const timer = setTimeout(() => {
      if (svgRef.current && value) {
        try {
          JsBarcode(svgRef.current, value, {
            format: "CODE128",
            width: 2,
            height: 60,
            displayValue: true,
            fontSize: 14,
            margin: 6,
          });
        } catch {
          /* valor no dibujable (ej. muy corto) */
        }
      }
      if (canvasRef.current && value) {
        try {
          JsBarcode(canvasRef.current, value, {
            format: "CODE128",
            width: 3,
            height: 80,
            displayValue: true,
            fontSize: 18,
          });
        } catch {
          /* ignore */
        }
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [product]);

  if (!product) return null;
  const value = product.codigoBarras || product.codigoItem;

  const copiarImagen = async () => {
    if (!canvasRef.current) return;
    setCopiando(true);
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvasRef.current!.toBlob(resolve, "image/png")
      );
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }
    } catch {
      /* portapapeles bloqueado */
    } finally {
      setCopiando(false);
    }
  };

  const imprimir = () => window.print();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 280, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-surface-800 border border-surface-600 rounded-3xl p-7 max-w-md w-full"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-neon-cyan/10 flex items-center justify-center">
                <Barcode className="h-5 w-5 text-neon-cyan" />
              </div>
              <div>
                <h3 className="font-bold text-gray-100">Etiqueta de producto</h3>
                <p className="text-xs text-muted">
                  Código de barras + QR para etiquetado
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-lg bg-surface-700 hover:bg-surface-600 flex items-center justify-center text-muted hover:text-gray-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Etiqueta imprimible */}
          <div className="print-label-area bg-white rounded-2xl p-5 mb-5">
            <p className="text-sm font-bold text-surface-900 text-center mb-3">
              {product.descripcion}
            </p>
            <div className="flex flex-col items-center gap-3">
              <svg ref={svgRef} className="bg-white" />
              {!product.codigoBarras && (
                <p className="text-[10px] text-gray-500">
                  (Sin código de barras registrado; se usó el código item)
                </p>
              )}
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded border border-gray-200">
                  <QRCodeSVG value={value} size={72} fgColor="#0a0a0a" />
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-gray-500">{product.codigoItem}</p>
                  <p className="text-2xl font-black text-surface-900">
                    ${product.precioUnitario.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Acciones */}
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={copiarImagen}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neon-cyan text-surface-900 font-bold text-sm shadow-neon-cyan transition-all"
            >
              {copiando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : copiado ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copiado ? "¡Copiada!" : "Copiar imagen"}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={imprimir}
              className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-neon-magenta text-white font-bold text-sm shadow-neon-magenta transition-all"
            >
              <Printer className="h-4 w-4" />
              Impresora térmica
            </motion.button>
          </div>

          <p className="mt-4 text-[11px] text-muted flex items-center gap-1.5">
            <QrCode className="h-3 w-3" />
            La etiqueta imprime por separado en blanco y negro (área de impresión exclusiva).
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function useLabelModal() {
  const [etiqueta, setEtiqueta] = useState<LabelProduct | null>(null);
  const node = <LabelModal product={etiqueta} onClose={() => setEtiqueta(null)} />;
  return { etiqueta, setEtiqueta, node };
}