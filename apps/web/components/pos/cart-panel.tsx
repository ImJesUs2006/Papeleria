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
  Users,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  WifiOff,
} from "lucide-react";
import { useCartStore, CartItem } from "@/store/cart";
import { useAuthStore } from "@/store/auth";
import { useConfigStore } from "@/store/config";
import { registrarVentaClient } from "@/lib/sales-client";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { ClientSelectModal } from "@/components/pos/client-select";
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
  offline: boolean;
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
    referenciaTransferencia,
    setReferenciaTransferencia,
    idCliente,
    nombreCliente,
    setCliente,
  } = useCartStore();
  const { idPersona, nombre } = useAuthStore();
  const config = useConfigStore((s) => s.config);

  const [estado, setEstado] = useState<"idle" | "cobrando" | "error">("idle");
  const [mensajeError, setMensajeError] = useState("");
  const [resultado, setResultado] = useState<VentaResult | null>(null);
  const [montoRecibido, setMontoRecibido] = useState("");
  const [showTransferencia, setShowTransferencia] = useState(false);
  const [referenciaInput, setReferenciaInput] = useState("");
  const [clienteModalOpen, setClienteModalOpen] = useState(false);

  const datosBancarios = config?.datosBancarios;

  const subtotal = getSubtotal();
  const iva = getIVA();
  const total = getTotal();
  const itemCount = getItemCount();

  const esEfectivo = metodoPago === "EFECTIVO";
  const esTransferencia = metodoPago === "DIGITAL";
  const esCredito = metodoPago === "CREDITO_TIENDA";
  const recibido = esEfectivo && montoRecibido ? parseFloat(montoRecibido) : 0;
  const cambio =
    esEfectivo && recibido >= total
      ? Math.round((recibido - total) * 100) / 100
      : null;

  const cobrar = async () => {
    if (!items.length || estado === "cobrando") return;
    // Blindaje Financiero: sin referencia capturada el pago no procede.
    if (esTransferencia && !referenciaTransferencia) {
      setReferenciaInput("");
      setShowTransferencia(true);
      return;
    }
    // CRM: la venta a crédito exige un cliente asignado.
    if (esCredito && !idCliente) {
      setClienteModalOpen(true);
      return;
    }
    setEstado("cobrando");
    setMensajeError("");
    try {
      const data = await registrarVentaClient(items, {
        metodoPago,
        tipoVenta: tipoVenta === "RECARGA" ? "RECARGA" : "PAPELERIA",
        montoRecibido: esEfectivo && montoRecibido ? Number(montoRecibido) : null,
        referenciaTransferencia: esTransferencia ? referenciaTransferencia : null,
        idCliente: esCredito ? idCliente : null,
        idUsuario: idPersona ?? "",
        nombreUsuario: nombre ?? "",
      });
      setResultado(data);
      clearCart();
      setMontoRecibido("");
      setEstado("idle");
    } catch (e: any) {
      setEstado("error");
      setMensajeError(e?.message || "No se pudo conectar con el servidor");
    }
  };

  const seleccionMetodo = (key: typeof metodoPago) => {
    setReferenciaTransferencia(null);
    if (key !== "CREDITO_TIENDA") setCliente(null, null);
    setMetodoPago(key);
    // Transferencia exige el captura de referencia antes de cobrar.
    if (key === "DIGITAL") {
      setReferenciaInput("");
      setShowTransferencia(true);
    }
    // Crédito de Tienda: abre el buscador/alta de cliente.
    if (key === "CREDITO_TIENDA") {
      setClienteModalOpen(true);
    }
  };

  const confirmarTransferencia = async () => {
    if (!/^\d{4}$/.test(referenciaInput)) return;
    setReferenciaTransferencia(referenciaInput);
    setShowTransferencia(false);
    setReferenciaInput("");
    await cobrar();
  };

  // Atajos: Ctrl+P cobra, Enter en efectivo cobra, Esc cierra el comprobante.
  useHotkeys(
    {
      "ctrl+p": () => cobrar(),
      Escape: () => setResultado(null),
    },
    { enabled: !!resultado || items.length > 0, allowInInputs: true }
  );

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
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: "EFECTIVO" as const, icon: Banknote, label: "Efectivo", cls: "text-neon-green border-neon-green/50 bg-neon-green/10" },
            { key: "TARJETA" as const, icon: CreditCard, label: "Tarjeta", cls: "text-neon-cyan border-neon-cyan/50 bg-neon-cyan/10" },
            { key: "DIGITAL" as const, icon: Smartphone, label: "Transferencia", cls: "text-neon-purple border-neon-purple/50 bg-neon-purple/10" },
            { key: "CREDITO_TIENDA" as const, icon: Users, label: "Crédito", cls: "text-amber-400 border-amber-400/50 bg-amber-400/10" },
          ].map(({ key, icon: Icon, label, cls }) => (
            <button
              key={key}
              onClick={() => seleccionMetodo(key)}
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

        {esCredito && (
          <div className="mt-3">
            {idCliente ? (
              <div className="flex items-center justify-between bg-amber-400/10 border border-amber-400/40 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="h-4 w-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-100 truncate">{nombreCliente}</p>
                    <p className="text-xs text-muted">Se cargará a su saldo deudor</p>
                  </div>
                </div>
                <button
                  onClick={() => setClienteModalOpen(true)}
                  className="text-xs text-amber-400 font-bold hover:text-amber-300 shrink-0"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setClienteModalOpen(true)}
                className="w-full text-xs text-amber-400 font-bold border border-dashed border-amber-400/50 rounded-lg px-3 py-2.5 hover:bg-amber-400/5 transition-colors"
              >
                Asignar cliente para la venta a crédito
              </button>
            )}
          </div>
        )}

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
              ? "bg-neon-green text-btn-ink shadow-neon hover:shadow-glow"
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
              <h3 className="text-xl font-black text-gray-100 mb-1">
                {resultado.offline ? "¡Venta guardada offline!" : "¡Venta registrada!"}
              </h3>
              <p className="text-sm text-muted mb-4">Folio: {resultado.folioVenta}</p>
              {resultado.offline && (
                <div className="flex items-center gap-2 bg-neon-yellow/10 border border-neon-yellow/40 rounded-xl px-3 py-2 mb-4 text-left">
                  <WifiOff className="h-4 w-4 text-warning shrink-0" />
                  <p className="text-[11px] text-gray-200">
                    Sin conexión: la venta se sincronizará automáticamente al recuperar la red.
                  </p>
                </div>
              )}
              <p className="text-3xl font-black text-neon-green text-glow-green mb-1">
                ${resultado.totalNeto.toFixed(2)}
              </p>
              {resultado.cambio != null && resultado.cambio > 0 && (
                <p className="text-sm text-warning font-bold mb-3">
                  Cambio: ${resultado.cambio.toFixed(2)}
                </p>
              )}
              <button
                onClick={() => setResultado(null)}
                className={cn("w-full py-3 rounded-xl font-bold mt-2", "bg-neon-green text-btn-ink")}
              >
                Nuevo cobro
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    {/* Modal de transferencia (Blindaje Financiero) */}
      <AnimatePresence>
        {showTransferencia && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            onClick={() => setShowTransferencia(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-800 border border-surface-600 rounded-3xl p-6 max-w-sm w-full"
            >
              <div className="flex items-center gap-2 mb-4">
                <Smartphone className="h-5 w-5 text-neon-purple" />
                <h3 className="font-black text-gray-100">Pago por transferencia</h3>
              </div>

              {datosBancarios?.banco || datosBancarios?.clabe ? (
                <div className="bg-surface-700 border border-surface-500 rounded-xl p-4 space-y-1.5 mb-4">
                  {datosBancarios.banco && (
                    <p className="text-xs text-muted">
                      Banco: <span className="text-gray-100 font-medium">{datosBancarios.banco}</span>
                    </p>
                  )}
                  {datosBancarios.titular && (
                    <p className="text-xs text-muted">
                      Titular: <span className="text-gray-100 font-medium">{datosBancarios.titular}</span>
                    </p>
                  )}
                  {datosBancarios.clabe && (
                    <p className="text-xs text-muted">
                      CLABE: <span className="text-gray-100 font-medium">{datosBancarios.clabe}</span>
                    </p>
                  )}
                  {datosBancarios.cuenta && (
                    <p className="text-xs text-muted">
                      Cuenta: <span className="text-gray-100 font-medium">{datosBancarios.cuenta}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted bg-surface-700 border border-surface-500 rounded-xl p-4 mb-4">
                  El negocio no ha registrado una cuenta bancaria. Pide los datos de
                  transferencia a la administradora y escribe la referencia del pago.
                </p>
              )}

              <label className="block mb-1">
                <span className="text-xs text-muted mb-1 block">
                  Últimos 4 dígitos de la referencia / tracking
                </span>
                <input
                  value={referenciaInput}
                  onChange={(e) =>
                    setReferenciaInput(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="0000"
                  autoFocus
                  className="w-full bg-surface-700 border border-surface-500 rounded-xl px-4 py-3 text-xl text-neon-purple font-black tracking-[0.4em] text-center focus:border-neon-purple focus:outline-none transition-all"
                />
              </label>
              <p className="text-[11px] text-muted mb-4">
                Escribe los últimos 4 dígitos del rastreo de la transferencia; quedan
                registrados en la venta y en el cierre de caja.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setShowTransferencia(false)}
                  className="py-3 rounded-xl bg-surface-700 text-muted text-sm font-bold hover:bg-surface-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarTransferencia}
                  disabled={!/^\d{4}$/.test(referenciaInput) || estado === "cobrando"}
                  className={cn(
                    "flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all",
                    /^\d{4}$/.test(referenciaInput) && estado !== "cobrando"
                      ? "bg-neon-green text-btn-ink shadow-neon"
                      : "bg-surface-600 text-muted cursor-not-allowed"
                  )}
                >
                  {estado === "cobrando" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Cobrar $" + total.toFixed(2)
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de selección/alta de cliente (crédito de tienda) */}
      <ClientSelectModal
        open={clienteModalOpen}
        onClose={() => setClienteModalOpen(false)}
        onSelect={(c) => setCliente(c.idCliente, c.nombre)}
      />
    </div>
  );
}