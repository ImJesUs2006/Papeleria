"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { useCartStore, CartItem } from "@/store/cart";
import { cn } from "@/lib/utils";

function CartItemRow({ item, index }: { item: CartItem; index: number }) {
  const { removeItem, updateQuantity } = useCartStore();

  return (
    <motion.div
      layout
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -50, opacity: 0 }}
      transition={{ delay: index * 0.05, type: "spring", damping: 25 }}
      className="flex items-center gap-3 bg-surface-700 rounded-lg p-3 group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100 truncate">
          {item.descripcion}
        </p>
        <p className="text-xs text-muted">
          {item.codigoItem} &middot; ${item.precioUnitario.toFixed(2)} c/u
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => updateQuantity(item.codigoItem, item.cantidad - 1)}
          className="h-7 w-7 rounded-md bg-surface-600 hover:bg-surface-500 flex items-center justify-center transition-colors"
        >
          <Minus className="h-3 w-3" />
        </button>
        <span className="w-8 text-center text-sm font-bold">{item.cantidad}</span>
        <button
          onClick={() => updateQuantity(item.codigoItem, item.cantidad + 1)}
          className="h-7 w-7 rounded-md bg-surface-600 hover:bg-surface-500 flex items-center justify-center transition-colors"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <span className="text-sm font-bold text-neon-green w-20 text-right">
        ${item.subtotalLinea.toFixed(2)}
      </span>

      <button
        onClick={() => removeItem(item.codigoItem)}
        className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-md bg-neon-red/10 hover:bg-neon-red/20 flex items-center justify-center transition-all"
      >
        <Trash2 className="h-3 w-3 text-neon-red" />
      </button>
    </motion.div>
  );
}

interface VentaResult {
  folioVenta: string;
  totalNeto: number;
  cambio: number | null;
}

export function CartPanel() {
  const {
    items,
    getSubtotal,
    getIVA,
    getTotal,
    getItemCount,
    metodoPago,
    setMetodoPago,
    tipoVenta,
    clearCart,
  } = useCartStore();

  const [estado, setEstado] = useState<"idle" | "cobrando" | "error">("idle");
  const [mensajeError, setMensajeError] = useState("");
  const [resultado, setResultado] = useState<VentaResult | null>(null);
  const [montoRecibido, setMontoRecibido] = useState("");

  const subtotal = getSubtotal();
  const iva = getIVA();
  const total = getTotal();
  const itemCount = getItemCount();

  const esEfectivo = metodoPago === "EFECTIVO";
  const recibido = esEfectivo && montoRecibido ? parseFloat(montoRecibido) : 0;
  const cambio =
    esEfectivo && recibido >= total
      ? Math.round((recibido - total) * 100) / 100
      : null;

  const cobrar = async () => {
    if (!items.length || estado === "cobrando") return;
    setEstado("cobrando");
    setMensajeError("");
    try {
      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            codigoItem: i.codigoItem,
            cantidad: i.cantidad,
          })),
          metodoPago,
          tipoVenta: tipoVenta === "RECARGA" ? "RECARGA" : "PAPELERIA",
          montoRecibido: esEfectivo && montoRecibido ? Number(montoRecibido) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEstado("error");
        setMensajeError(data.error || "Error al procesar la venta");
        return;
      }
      setResultado(data);
      clearCart();
      setMontoRecibido("");
      setEstado("idle");
    } catch {
      setEstado("error");
      setMensajeError("No se pudo conectar con el servidor");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-600">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-neon-blue" />
          <span className="font-bold text-gray-100">Carrito</span>
        </div>
        <motion.span
          key={itemCount}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          className="bg-neon-blue/20 text-neon-blue text-xs font-bold px-2 py-1 rounded-full"
        >
          {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
        </motion.span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <AnimatePresence mode="popLayout">
          {items.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-muted"
            >
              <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Escanea o busca un producto</p>
            </motion.div>
          ) : (
            items.map((item, i) => (
              <CartItemRow key={item.codigoItem} item={item} index={i} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Payment method selector */}
      <div className="px-4 py-3 border-t border-surface-600">
        <p className="text-xs text-muted mb-2 uppercase tracking-wider">
          Método de pago
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "EFECTIVO" as const, icon: Banknote, label: "Efectivo", cls: "text-neon-green border-neon-green/50 bg-neon-green/10" },
            { key: "TARJETA" as const, icon: CreditCard, label: "Tarjeta", cls: "text-neon-cyan border-neon-cyan/50 bg-neon-cyan/10" },
            { key: "DIGITAL" as const, icon: Smartphone, label: "Digital", cls: "text-neon-magenta border-neon-magenta/50 bg-neon-magenta/10" },
          ].map(({ key, icon: Icon, label, cls }) => (
            <button
              key={key}
              onClick={() => setMetodoPago(key)}
              className={cn(
                "flex flex-col items-center gap-1 py-2 rounded-lg border transition-all",
                metodoPago === key ? cls : "border-surface-500 bg-surface-700 text-muted hover:border-surface-400"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>

        {esEfectivo && (
          <div className="mt-3">
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Recibido ($)</span>
              <input
                type="number"
                value={montoRecibido}
                onChange={(e) => setMontoRecibido(e.target.value)}
                placeholder="0.00"
                min={0}
                className="w-full bg-surface-700 border border-surface-500 rounded-lg px-3 py-2.5 text-lg text-neon-green font-bold focus:border-neon-green focus:shadow-neon focus:outline-none transition-all"
              />
            </label>
            {recibido >= total && (
              <p className="text-sm mt-1 text-neon-green font-bold">
                Cambio: ${cambio!.toFixed(2)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="px-4 py-3 border-t border-surface-600 space-y-1">
        <div className="flex justify-between text-sm text-muted">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted">
          <span>IVA (16%)</span>
          <span>${iva.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold text-gray-100 pt-1 border-t border-surface-500">
          <span>Total</span>
          <span className="text-neon-green">${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {estado === "error" && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-lg px-3 py-2.5"
          >
            <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" />
            <p className="text-xs text-gray-100 flex-1">{mensajeError}</p>
            <button onClick={() => setEstado("idle")} className="text-muted hover:text-gray-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="p-4 space-y-2">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.97 }}
          onClick={cobrar}
          disabled={items.length === 0 || estado === "cobrando"}
          className={cn(
            "w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2",
            items.length > 0
              ? "bg-neon-green text-surface-900 shadow-neon hover:shadow-glow"
              : "bg-surface-600 text-muted cursor-not-allowed"
          )}
        >
          {estado === "cobrando" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Procesando...
            </>
          ) : (
            <>Cobrar ${total.toFixed(2)}</>
          )}
        </motion.button>

        <button
          onClick={clearCart}
          disabled={items.length === 0}
          className="w-full py-2 text-sm text-muted hover:text-neon-red transition-colors"
        >
          Vaciar carrito
        </button>
      </div>

      {/* Éxito de venta */}
      <AnimatePresence>
        {resultado && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setResultado(null)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-800 border-2 border-neon-green/40 rounded-3xl p-8 max-w-sm w-full text-center shadow-neon"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                className="h-16 w-16 mx-auto rounded-full bg-neon-green/10 flex items-center justify-center mb-4"
              >
                <CheckCircle2 className="h-9 w-9 text-neon-green" />
              </motion.div>
              <h3 className="text-xl font-black text-gray-100 mb-1">¡Venta registrada!</h3>
              <p className="text-sm text-muted mb-4">Folio: {resultado.folioVenta}</p>
              <p className="text-3xl font-black text-neon-green text-glow-green mb-1">
                ${resultado.totalNeto.toFixed(2)}
              </p>
              {resultado.cambio != null && resultado.cambio > 0 && (
                <p className="text-sm text-neon-yellow font-bold mb-3">
                  Cambio: ${resultado.cambio.toFixed(2)}
                </p>
              )}
              <button
                onClick={() => setResultado(null)}
                className={cn("w-full py-3 rounded-xl font-bold mt-2", "bg-neon-green text-surface-900")}
              >
                Nuevo cobro
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}