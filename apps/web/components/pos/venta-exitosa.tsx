"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Printer, FileDown, CheckCircle2, WifiOff, XCircle } from "lucide-react";
import { numeroSeguro, type ResultadoVenta } from "@/lib/sales-client";
import { imprimirTicket, type AnchoTicketImpresion } from "@/lib/print-ticket";
import { descargarTicketPDF } from "@/lib/pdf";
import { cn } from "@/lib/utils";

const ETIQUETA_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta (terminal)",
  TARJETA_TERMINAL: "Tarjeta (terminal)",
  DIGITAL: "Transferencia",
  TRANSFERENCIA: "Transferencia",
  PUNTOS_MONEDERO: "Monedero (puntos)",
};

interface Props {
  result: ResultadoVenta;
  anchoTicket?: AnchoTicketImpresion;
  nombreNegocio: string;
  onClose: () => void;
}

/**
 * Modal "Venta Exitosa" (Fase 12): una impresora "expulsa" el ticket
 * (Framer Motion), el cambio a entregar se muestra gigante, y la cajera
 * imprime en térmica (Fase 11) o descarga el PDF (lib/pdf.ts).
 */
export function VentaExitosaModal({ result, anchoTicket, nombreNegocio, onClose }: Props) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const ancho = anchoTicket ?? "80mm";
  const cambio = result.cambio != null && Number(result.cambio) > 0 ? Number(result.cambio) : null;

  const fecha = new Date(result.fechaHora).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/75 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-800 border-2 border-neon-green/40 rounded-3xl p-6 max-w-lg w-full shadow-neon text-center overflow-hidden"
      >
        {/* Encabezado */}
        <div className="flex items-center justify-center gap-2 mb-1">
          {result.offline ? (
            <WifiOff className="h-5 w-5 text-neon-yellow" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-neon-green" />
          )}
          <h3 className="text-xl font-black text-gray-100">
            {result.offline ? "¡Venta guardada offline!" : "¡Venta registrada!"}
          </h3>
        </div>
        <p className="text-sm text-muted mb-4">Folio: {result.folioVenta}</p>

        {/* Impresora expulsando el ticket */}
        <div className="mx-auto max-w-[300px]">
          <div className="relative rounded-2xl bg-surface-600/80 border border-surface-500 px-4 pt-3 pb-2">
            <div className="h-1.5 w-24 mx-auto bg-surface-500 rounded-full mb-2" />
            <p className="text-[10px] text-muted font-bold uppercase tracking-widest text-center">
              {nombreNegocio || "Impresora"}
            </p>
            <div className="relative overflow-hidden rounded-xl h-56 mt-2">
              {/* Ticket que sale de la ranura */}
              <motion.div ref={ticketRef} className="print-label-area print-ticket-80 absolute inset-x-2 top-1 bottom-1"
                initial={{ y: -170, opacity: 0.6 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 90, damping: 16 }}
              >
                <div className="bg-white text-black rounded px-2 py-2 text-[10px] leading-snug font-mono text-left">
                  <p className="text-center font-black tracking-wide uppercase">{nombreNegocio || "Papelería"}</p>
                  <p className="text-center mb-1">Comprobante de venta</p>
                  <p className="border-b border-dashed border-gray-300 pb-1 mb-1">
                    Folio: {result.folioVenta}
                    <br />Fecha: {fecha}
                  </p>
                  {result.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between gap-1 border-b border-dashed border-gray-200 py-0.5">
                      <span className="truncate max-w-[140px]">{i.descripcion}</span>
                      <span className="shrink-0">
                        {numeroSeguro(i.cantidad)} × ${numeroSeguro(i.importe).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-1">
                    <span>Subtotal</span><span>${numeroSeguro(result.subtotal).toFixed(2)}</span>
                  </div>
                  {numeroSeguro(result.ieps) > 0 && (
                    <div className="flex justify-between">
                      <span>IEPS</span><span>${numeroSeguro(result.ieps).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>IVA</span><span>${numeroSeguro(result.iva).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-black text-sm">
                    <span>TOTAL</span><span>${numeroSeguro(result.totalNeto).toFixed(2)}</span>
                  </div>
                  <p className="mt-1">{ETIQUETA_PAGO[result.metodoPago] ?? result.metodoPago}</p>
                  {result.nombreCliente && <p>Cliente: {result.nombreCliente}</p>}
                  <p className="text-center mt-1">¡Gracias por su compra!</p>
                </div>
              </motion.div>
            </div>
            {/* Ranura de la impresora */}
            <div className="h-2 bg-surface-500/80 rounded-b-md mt-2 flex items-center justify-center gap-6">
              <div className="h-1 w-10 bg-surface-600 rounded-full" />
              <div className="h-1 w-10 bg-surface-600 rounded-full" />
              <div className="h-1 w-10 bg-surface-600 rounded-full" />
            </div>
          </div>
        </div>

        {/* Total + cambio gigante */}
        <div className="mt-4 mb-4">
          <p className="text-sm text-muted">TOTAL A PAGAR</p>
          <p className="text-4xl font-black text-neon-green text-glow-green -mt-1">
            ${numeroSeguro(result.totalNeto).toFixed(2)}
          </p>
          {cambio != null && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.55, type: "spring", stiffness: 220, damping: 15 }}
              className="mt-2 bg-neon-green/10 border border-neon-green/50 rounded-2xl px-4 py-3"
            >
              <p className="text-xs font-bold text-neon-green uppercase tracking-widest">
                Cambio a entregar
              </p>
              <p className="text-4xl font-black text-neon-green text-glow-green">
                ${numeroSeguro(cambio).toFixed(2)}
              </p>
            </motion.div>
          )}
        </div>

        {/* Offline notice */}
        {result.offline && (
          <div className="mb-4">
            <p className="text-[11px] text-warning bg-neon-yellow/10 border border-neon-yellow/40 rounded-xl px-3 py-2">
              Sin conexión: la venta se sincronizará automáticamente al recuperar la red.
            </p>
          </div>
        )}

        {/* Acciones */}
        <div className="grid grid-cols-1 gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => imprimirTicket(ticketRef.current, ancho)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-surface-600 hover:bg-surface-500 text-gray-100 text-sm font-bold transition-colors"
            >
              <Printer className="h-4 w-4" /> Imprimir ticket
            </button>
            <button
              onClick={() =>
                descargarTicketPDF(
                  {
                    folioVenta: result.folioVenta,
                    totalNeto: result.totalNeto,
                    subtotal: result.subtotal,
                    iva: result.iva,
                    ieps: result.ieps,
                    cambio: result.cambio,
                    metodoPago: result.metodoPago,
                    nombreCliente: result.nombreCliente,
                    fechaHora: result.fechaHora,
                    offline: result.offline,
                    items: result.items,
                  },
                  nombreNegocio
                )
              }
              className="flex items-center justify-center gap-2 py-3 rounded-xl bg-neon-blue/10 border border-neon-blue/40 hover:bg-neon-blue/20 text-neon-blue text-sm font-bold transition-colors"
            >
              <FileDown className="h-4 w-4" /> Descargar PDF
            </button>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-neon-green text-btn-ink font-black hover:shadow-glow transition-all"
          >
            <XCircle className="h-4 w-4" /> Nuevo cobro
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}