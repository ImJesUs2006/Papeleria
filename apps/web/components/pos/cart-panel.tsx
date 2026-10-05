"use client";

import { useState, useEffect } from "react";
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
  PackagePlus,
  Coins,
  BadgePercent,
} from "lucide-react";
import { useCartStore, CartItem, type MetodoPagoPOS } from "@/store/cart";
import { useAuthStore } from "@/store/auth";
import { useConfigStore } from "@/store/config";
import { registrarVentaClient, type ResultadoVenta } from "@/lib/sales-client";
import { puntosRequeridos } from "@/lib/fidelidad";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { ClientSelectModal } from "@/components/pos/client-select";
import { VentaExitosaModal } from "@/components/pos/venta-exitosa";
import { cn } from "@/lib/utils";

function CartItemRow({ item, index }: { item: CartItem; index: number }) {
  const { removeItem, updateQuantity } = useCartStore();
  const decimales = item.permiteDecimales === true || item.esServicio === true;

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
          {item.esServicio && (
            <span className="text-neon-purple font-bold"> &middot; Servicio</span>
          )}
        </p>
      </div>

      {decimales ? (
        <input
          type="number"
          value={item.cantidad}
          step="0.001"
          min="0"
          inputMode="decimal"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isFinite(v)) return;
            updateQuantity(item.codigoItem, Math.round(v * 1000) / 1000);
          }}
          className="w-20 text-center text-sm font-bold bg-surface-600 border border-surface-500 rounded-lg px-2 py-1.5 text-gray-100 focus:border-neon-cyan focus:outline-none transition-all"
        />
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => updateQuantity(item.codigoItem, item.cantidad - 1)}
            className="h-7 w-7 rounded-md bg-surface-600 hover:bg-surface-500 flex items-center justify-center transition-colors"
          >
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-8 text-center text-sm font-bold">{item.cantidad}</span>
          <button
            type="button"
            onClick={() => updateQuantity(item.codigoItem, item.cantidad + 1)}
            className="h-7 w-7 rounded-md bg-surface-600 hover:bg-surface-500 flex items-center justify-center transition-colors"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}

      <span className="text-sm font-bold text-neon-green w-20 text-right">
        ${item.subtotalLinea.toFixed(2)}
      </span>

      <button
        type="button"
        onClick={() => removeItem(item.codigoItem)}
        className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded-md bg-neon-red/10 hover:bg-neon-red/20 flex items-center justify-center transition-all"
      >
        <Trash2 className="h-3 w-3 text-neon-red" />
      </button>
    </motion.div>
  );
}

interface BtnMetodo {
  uiKey: "EFECTIVO" | "TARJETA" | "DIGITAL" | "PUNTOS_MONEDERO";
  /** Clave real de la config del negocio (Marca Blanca). */
  configKey: string;
  icon: typeof Banknote;
  label: string;
  cls: string;
}

/** Mapa UI → config de métodos de pago (Fase 12). "Crédito" fue eliminado. */
const METODOS_POS: BtnMetodo[] = [
  { uiKey: "EFECTIVO", configKey: "EFECTIVO", icon: Banknote, label: "Efectivo", cls: "text-emerald-400 border-emerald-400/50 bg-emerald-400/10" },
  { uiKey: "TARJETA", configKey: "TARJETA_TERMINAL", icon: CreditCard, label: "Tarjeta", cls: "text-sky-400 border-sky-400/50 bg-sky-400/10" },
  { uiKey: "DIGITAL", configKey: "TRANSFERENCIA", icon: Smartphone, label: "Transferencia", cls: "text-indigo-400 border-indigo-400/50 bg-indigo-400/10" },
  { uiKey: "PUNTOS_MONEDERO", configKey: "PUNTOS_MONEDERO", icon: Coins, label: "Puntos", cls: "text-amber-300 border-amber-400/50 bg-amber-400/10" },
];

function ApartadoModal({
  open,
  onClose,
  items,
  total,
  idCliente,
  nombreCliente,
  onCambiarCliente,
  onCreado,
}: {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  total: number;
  idCliente: string | null;
  nombreCliente: string | null;
  onCambiarCliente: () => void;
  onCreado: () => void;
}) {
  const [anticipo, setAnticipo] = useState("");
  const [metodoAnticipo, setMetodoAnticipo] = useState("EFECTIVO");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ folio: string; saldoPendiente: number } | null>(null);

  const monto = anticipo ? parseFloat(anticipo) : 0;
  const valido = !Number.isNaN(monto) && monto >= 0 && monto <= total;

  const crear = async () => {
    if (!valido || !idCliente || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/apartados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ codigoItem: i.codigoItem, cantidad: i.cantidad })),
          idCliente,
          anticipo: monto,
          metodoAnticipo,
          notas: notas.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el apartado");
      setCreado({ folio: data.folio, saldoPendiente: data.saldoPendiente });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  useEffect(() => {
    if (open) {
      setAnticipo("");
      setMetodoAnticipo("EFECTIVO");
      setNotas("");
      setError(null);
      setCreado(null);
      setGuardando(false);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => {
            if (!guardando && !creado) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface-800 border border-surface-600 rounded-3xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
          >
            {creado ? (
              <div className="text-center py-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18 }}
                  className="h-16 w-16 mx-auto rounded-full bg-neon-blue/10 flex items-center justify-center mb-4"
                >
                  <CheckCircle2 className="h-9 w-9 text-neon-blue" />
                </motion.div>
                <h3 className="text-xl font-black text-gray-100 mb-1">¡Apartado creado!</h3>
                <p className="text-sm text-muted mb-2">
                  Folio: <span className="text-gray-100 font-bold">{creado.folio}</span>
                </p>
                <p className="text-sm text-muted mb-4">
                  El stock quedó reservado. Saldo por liquidar:
                </p>
                <p className="text-3xl font-black text-neon-blue mb-5">
                  ${creado.saldoPendiente.toFixed(2)}
                </p>
                <button
                  onClick={onCreado}
                  className="w-full py-3 rounded-xl font-bold bg-neon-blue text-btn-ink"
                >
                  Entendido
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <PackagePlus className="h-5 w-5 text-neon-blue" />
                  <h3 className="font-black text-gray-100">Crear apartado</h3>
                </div>

                <div className="flex items-center justify-between bg-neon-blue/10 border border-neon-blue/40 rounded-xl px-4 py-3 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="h-4 w-4 text-neon-blue shrink-0" />
                    <span className="text-sm font-bold text-gray-100 truncate">
                      {nombreCliente}
                    </span>
                  </div>
                  <button
                    onClick={onCambiarCliente}
                    className="text-xs text-neon-blue font-bold hover:text-neon-cyan shrink-0"
                  >
                    Cambiar
                  </button>
                </div>

                <p className="text-xs text-muted mb-4">
                  El stock se reserva de inmediato (sale del inventario) y el anticipo ingresa
                  a la caja. La venta se materializa al liquidar el saldo.
                </p>

                <div className="flex items-center gap-3 mb-1">
                  <label className="block flex-1">
                    <span className="text-xs text-muted mb-1 block">Anticipo ($)</span>
                    <input
                      type="number"
                      value={anticipo}
                      onChange={(e) => setAnticipo(e.target.value)}
                      placeholder="0.00"
                      min={0}
                      max={total}
                      className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-lg text-neon-blue font-bold focus:border-neon-blue focus:outline-none transition-all"
                    />
                  </label>
                  <label className="block flex-1">
                    <span className="text-xs text-muted mb-1 block">Recibe en</span>
                    <select
                      value={metodoAnticipo}
                      onChange={(e) => setMetodoAnticipo(e.target.value)}
                      className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:border-neon-blue focus:outline-none transition-all"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="DIGITAL">Transferencia</option>
                    </select>
                  </label>
                </div>
                <div className="flex gap-1.5 mb-3">
                  {[10, 25, 50].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAnticipo(String(Math.round(total * (p / 100) * 100) / 100))}
                      className="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-500 text-[11px] font-bold text-muted hover:text-neon-blue hover:border-neon-blue/40 transition-colors"
                    >
                      {p}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAnticipo(String(total))}
                    className="px-3 py-1.5 rounded-lg bg-surface-700 border border-surface-500 text-[11px] font-bold text-muted hover:text-neon-blue hover:border-neon-blue/40 transition-colors"
                  >
                    100%
                  </button>
                </div>
                <p className="text-[11px] text-muted mb-3">
                  Total {items.length} artículos · <b className="text-gray-100">${total.toFixed(2)}</b>.
                  {monto > 0 && monto <= total && (
                    <span className="text-neon-blue">
                      {" "}
                      Saldo pendiente: ${(total - monto).toFixed(2)}
                    </span>
                  )}
                </p>

                <label className="block mb-4">
                  <span className="text-xs text-muted mb-1 block">Notas (opcional)</span>
                  <textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="Ej. Se entrega el sábado"
                    className="w-full bg-surface-700 border border-surface-500 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:border-neon-blue focus:outline-none transition-all resize-none"
                  />
                </label>

                {error && (
                  <div className="flex items-center gap-2 bg-neon-red/10 border border-neon-red/40 rounded-xl px-4 py-2.5 text-sm text-gray-100 mb-4">
                    <AlertTriangle className="h-4 w-4 text-neon-red shrink-0" />
                    <span className="flex-1">{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onClose}
                    disabled={guardando}
                    className="py-3 rounded-xl bg-surface-700 text-muted text-sm font-bold hover:bg-surface-600 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={crear}
                    disabled={guardando || !valido}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-3 rounded-xl font-bold text-sm transition-all",
                      guardando || !valido
                        ? "bg-surface-600 text-muted cursor-not-allowed"
                        : "bg-neon-blue text-btn-ink"
                    )}
                  >
                    {guardando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PackagePlus className="h-4 w-4" />
                    )}
                    Crear apartado
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
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
    puntosCliente,
    nivelCliente,
    setCliente,
    esMayoreo,
    setEsMayoreo,
    getTieneMayoreo,
  } = useCartStore();
  const { idPersona, nombre } = useAuthStore();
  const config = useConfigStore((s) => s.config);

  const [estado, setEstado] = useState<"idle" | "cobrando" | "error">("idle");
  const [mensajeError, setMensajeError] = useState("");
  const [resultado, setResultado] = useState<ResultadoVenta | null>(null);
  const [montoRecibido, setMontoRecibido] = useState("");
  const [showTransferencia, setShowTransferencia] = useState(false);
  const [referenciaInput, setReferenciaInput] = useState("");
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [modoApartado, setModoApartado] = useState(false);
  const [apartadoModalOpen, setApartadoModalOpen] = useState(false);

  const datosBancarios = config?.datosBancarios;

  const subtotal = getSubtotal();
  const iva = getIVA();
  const total = getTotal();
  const itemCount = getItemCount();
  const tieneMayoreo = getTieneMayoreo();

  const esEfectivo = metodoPago === "EFECTIVO";
  const esTransferencia = metodoPago === "DIGITAL";
  const esMonedero = metodoPago === "PUNTOS_MONEDERO";
  // Fase 12: tasa del negocio (defaults = 1 punto por $100; 1pt = $1).
  const valorPunto = config?.puntosConfig?.valorPuntoPesos ?? 1;
  const necesitaCliente = esMonedero;
  const ptsNecesarios = esMonedero && idCliente ? puntosRequeridos(total, valorPunto) : 0;
  const monederoAlcanza = esMonedero ? puntosCliente >= ptsNecesarios : true;
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
    // CRM/Monedero: la venta exige un cliente asignado.
    if (necesitaCliente && !idCliente) {
      setClienteModalOpen(true);
      return;
    }
    // Monedero: bloquea el pago si los puntos no cubren el total (el servidor
    // también lo valida; esto evita el viaje redondo con error).
    if (esMonedero && !monederoAlcanza) {
      setMensajeError(
        "El saldo de puntos no alcanza a cubrir el total de la venta"
      );
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
        // El cliente es obligatorio para canjar puntos y opcional en el resto
        // de los métodos (donde solo acumula fidelidad).
        idCliente,
        idUsuario: idPersona ?? "",
        nombreUsuario: nombre ?? "",
        // Fase 12: el servidor reaplica el precio de mayoreo vigente.
        esMayoreo,
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

  const seleccionMetodo = (key: MetodoPagoPOS) => {
    setReferenciaTransferencia(null);
    // Al cambiar de método se reinicia el cliente; en efectivo/tarjeta/
    // transferencia puede reasignarse desde la tarjeta del carrito.
    if (key !== "PUNTOS_MONEDERO") {
      setReferenciaInput("");
    }
    setMetodoPago(key);
    // Transferencia exige el captura de referencia antes de cobrar.
    if (key === "DIGITAL") {
      setReferenciaInput("");
      setShowTransferencia(true);
    }
    // Puntos Monedero: abre el buscador de cliente (obligatorio).
    if (key === "PUNTOS_MONEDERO") {
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

  const abrirApartado = () => {
    if (!items.length) return;
    setModoApartado(true);
    // El apartado siempre exige cliente: sin uno asignado, se busca primero.
    if (!idCliente) {
      setClienteModalOpen(true);
    } else {
      setApartadoModalOpen(true);
    }
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

      {/* Fase 12: interruptor de precios de mayoreo (reprecia todo el carrito). */}
      <div className="px-4 py-2.5 border-t border-surface-600">
        <button
          type="button"
          onClick={() => setEsMayoreo(!esMayoreo)}
          disabled={!items.length || !tieneMayoreo}
          aria-pressed={esMayoreo}
          className={cn(
            "w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-all text-xs",
            !items.length || !tieneMayoreo
              ? "border-surface-500 bg-surface-700 text-muted/60 cursor-not-allowed"
              : esMayoreo
                ? "border-teal-500/60 bg-teal-500/10 text-teal-300"
                : "border-surface-500 bg-surface-700 text-muted hover:border-teal-500/50 hover:text-teal-300"
          )}
        >
          <span className="flex items-center gap-2 font-medium">
            <BadgePercent className="h-4 w-4 shrink-0" />
            Precios de Mayoreo
          </span>
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              esMayoreo ? "bg-teal-500" : "bg-surface-600"
            )}
          >
            <span
              className={cn(
                "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                esMayoreo ? "translate-x-5" : "translate-x-1"
              )}
            />
          </span>
        </button>
        {!tieneMayoreo && items.length > 0 && (
          <p className="mt-1 text-[11px] text-muted">
            Ningún producto del carrito tiene precio de mayoreo configurado.
          </p>
        )}
      </div>

      {/* Payment method selector */}
      <div className="px-4 py-3 border-t border-surface-600">
        <p className="text-xs text-muted mb-2 uppercase tracking-wider">
          Método de pago
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {METODOS_POS.filter((m) => m.uiKey !== "PUNTOS_MONEDERO")
            .filter((m) => !config?.metodosPago?.length || config.metodosPago.includes(m.configKey as any))
            .map(({ uiKey, icon: Icon, label, cls }) => (
              <button
                key={uiKey}
                onClick={() => seleccionMetodo(uiKey)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 rounded-lg border transition-all",
                  metodoPago === uiKey ? cls : "border-surface-500 bg-surface-700 text-muted hover:border-surface-400"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs">{label}</span>
              </button>
            ))}
        </div>
        {/* Fase 12: Puntos Monedero (canje de fidelidad), ancho completo. */}
        {(!config?.metodosPago?.length ||
          config.metodosPago.includes("PUNTOS_MONEDERO")) && (
          <button
            onClick={() => seleccionMetodo("PUNTOS_MONEDERO")}
            className={cn(
              "mt-1.5 w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border transition-all text-xs",
              esMonedero
                ? "text-neon-yellow border-neon-yellow/50 bg-neon-yellow/10"
                : "border-surface-500 bg-surface-700 text-muted hover:border-neon-yellow/50 hover:text-neon-yellow"
            )}
          >
            <Coins className="h-3.5 w-3.5" /> Puntos Monedero
          </button>
        )}

        {necesitaCliente && (
          <div className="mt-3">
            {idCliente ? (
              <div
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5",
                  esMonedero
                    ? "bg-neon-yellow/10 border border-neon-yellow/40"
                    : "bg-amber-400/10 border border-amber-400/40"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {esMonedero ? (
                    <Coins className="h-4 w-4 text-neon-yellow shrink-0" />
                  ) : (
                    <Users className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-100 truncate">{nombreCliente}</p>
                    <p className="text-xs text-muted">
                      {esMonedero ? (
                        <>
                          {monederoAlcanza ? (
                            <>Canjeará {ptsNecesarios} pts de {puntosCliente} disponibles</>
                          ) : (
                            <span className="text-neon-red font-bold">
                              Saldo insuficiente: {puntosCliente} pts &lt; {ptsNecesarios}
                            </span>
                          )}
                        </>
                      ) : (
                        <>Se cargará a su saldo deudor</>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setClienteModalOpen(true)}
                  className={cn(
                    "text-xs font-bold hover:opacity-80 shrink-0",
                    esMonedero ? "text-neon-yellow" : "text-amber-400"
                  )}
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setClienteModalOpen(true)}
                className={cn(
                  "w-full text-xs font-bold border border-dashed rounded-lg px-3 py-2.5 transition-colors",
                  esMonedero
                    ? "text-neon-yellow border-neon-yellow/50 hover:bg-neon-yellow/5"
                    : "text-amber-400 border-amber-400/50 hover:bg-amber-400/5"
                )}
              >
                {esMonedero
                  ? "Seleccionar cliente para canjear sus puntos"
                  : "Asignar cliente para la venta a crédito"}
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
          onClick={abrirApartado}
          disabled={items.length === 0}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-neon-blue/40 text-neon-blue hover:bg-neon-blue/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <PackagePlus className="h-4 w-4" />
          Crear apartado
        </button>

        <button
          onClick={clearCart}
          disabled={items.length === 0}
          className="w-full py-2 text-sm text-muted hover:text-neon-red transition-colors"
        >
          Vaciar carrito
        </button>
      </div>

      {/* Éxito de venta: impresora + ticket + cambio gigante (Fase 12) */}
      <AnimatePresence>
        {resultado && (
          <VentaExitosaModal
            result={resultado}
            anchoTicket={config?.anchoTicket ?? "80mm"}
            nombreNegocio={config?.datosFiscales?.razonSocial || config?.nombreNegocio || "Papelería"}
            onClose={() => setResultado(null)}
          />
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

      {/* Modal de selección/alta de cliente (crédito de tienda / puntos / apartado) */}
      <ClientSelectModal
        open={clienteModalOpen}
        modo={esMonedero ? "monedero" : "credito"}
        totalVenta={total}
        valorPuntoPesos={valorPunto}
        onClose={() => {
          setClienteModalOpen(false);
          setModoApartado(false);
        }}
        onSelect={(c) => {
          setCliente(c.idCliente, c.nombre, c.puntosFidelidad, c.nivel, c.montoHistorico);
          if (modoApartado) setApartadoModalOpen(true);
          setModoApartado(false);
        }}
      />

      <ApartadoModal
        open={apartadoModalOpen}
        onClose={() => setApartadoModalOpen(false)}
        items={items}
        total={total}
        idCliente={idCliente}
        nombreCliente={nombreCliente}
        onCambiarCliente={() => {
          setApartadoModalOpen(false);
          setModoApartado(true);
          setClienteModalOpen(true);
        }}
        onCreado={() => {
          setApartadoModalOpen(false);
          clearCart();
        }}
      />
    </div>
  );
}