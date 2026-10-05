import { create } from "zustand";
import { fiscalCliente } from "@/store/config";
import { calcularImpuestos, tasasProducto, type ResumenFiscal } from "@/lib/impuestos";

export interface CartItem {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  cantidad: number;
  subtotalLinea: number;
  tipoImpresion?: string;
  /** Fase 10: el producto se vende a granel (cantidades fraccionarias). */
  permiteDecimales?: boolean;
  /** Fase 10: servicio puro; no descuenta stock ni genera Kardex. */
  esServicio?: boolean;
  /**
   * Fase 12: precio de mayoreo del producto (null si no tiene). El
   * interruptor "Precios de Mayoreo" del POS reprecia toda la venta con este
   * valor; los productos sin mayoreo conservan su precio de menudeo.
   */
  precioMayoreo?: number | null;
  /** Fase 12: imagen del producto (Cloudinary) para el catálogo táctil. */
  imagenUrl?: string | null;
  /** Impuestos del producto: IVA propio (null = el del negocio), exento, IEPS. */
  tasaIva?: number | null;
  exentoIva?: boolean;
  tasaIeps?: number | null;
}

/**
 * Totales fiscales de un carrito con el MISMO motor que usa el servidor
 * (IVA por producto, IEPS y precios con impuestos incluidos).
 */
export function totalesCarrito(
  items: Pick<CartItem, "subtotalLinea" | "tasaIva" | "exentoIva" | "tasaIeps">[]
): ResumenFiscal {
  const { ivaNegocio, preciosIncluyenIva } = fiscalCliente();
  return calcularImpuestos(
    items.map((i) => ({
      importe: Math.round(Number(i.subtotalLinea) * 100) / 100,
      ...tasasProducto(i, ivaNegocio),
    })),
    { preciosIncluyenIva }
  );
}

export type MetodoPagoPOS = "EFECTIVO" | "TARJETA" | "DIGITAL" | "PUNTOS_MONEDERO";

/**
 * Precio unitario efectivo de una línea según el modo de venta.
 * Nunca devuelve NaN/undefined: si no hay precio de mayoreo, cae a menudeo.
 */
export function precioUnitarioEfectivo(
  item: Pick<CartItem, "precioUnitario" | "precioMayoreo">,
  esMayoreo: boolean
): number {
  const menudeo = Number(item.precioUnitario);
  if (!esMayoreo) return Number.isFinite(menudeo) ? menudeo : 0;
  const mayoreo = Number(item.precioMayoreo);
  if (Number.isFinite(mayoreo) && mayoreo > 0) return mayoreo;
  return Number.isFinite(menudeo) ? menudeo : 0;
}

interface CartState {
  items: CartItem[];
  metodoPago: MetodoPagoPOS;
  tipoVenta: "PAPELERIA" | "RECARGA";
  /** Blindaje Financiero: últimos 4 dígitos del rastreo de transferencia. */
  referenciaTransferencia: string | null;
  /** CRM (Fase 12): cliente asignado a la venta (obligatorio con puntos). */
  idCliente: string | null;
  nombreCliente: string | null;
  /** Fase 12: saldo de puntos / nivel del cliente en el POS (tarjeta virtual). */
  puntosCliente: number;
  nivelCliente: "MENUDEO" | "MAYOREO";
  montoHistoricoCliente: number;
  /**
   * Fase 12: interruptor de venta a mayoreo. Reprecia TODO el carrito con
   * `precioMayoreo` de cada producto (los que no tienen, quedan igual).
   */
  esMayoreo: boolean;

  addItem: (item: Omit<CartItem, "subtotalLinea">) => void;
  removeItem: (codigoItem: string) => void;
  updateQuantity: (codigoItem: string, cantidad: number) => void;
  clearCart: () => void;
  setMetodoPago: (metodoPago: MetodoPagoPOS) => void;
  setTipoVenta: (tipo: "PAPELERIA" | "RECARGA") => void;
  setReferenciaTransferencia: (referencia: string | null) => void;
  setCliente: (
    idCliente: string | null,
    nombreCliente: string | null,
    puntosCliente?: number,
    nivelCliente?: "MENUDEO" | "MAYOREO",
    montoHistoricoCliente?: number
  ) => void;
  /** Activa/desactiva el precio de mayoreo en todo el carrito. */
  setEsMayoreo: (esMayoreo: boolean) => void;
  /** ¿Al menos una línea del carrito tiene precio de mayoreo? */
  getTieneMayoreo: () => boolean;

  /** Desglose fiscal completo (base, IEPS, IVA y total a pagar). */
  getTotales: () => ResumenFiscal;
  getSubtotal: () => number;
  getIVA: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  metodoPago: "EFECTIVO",
  tipoVenta: "PAPELERIA",
  referenciaTransferencia: null,
  idCliente: null,
  nombreCliente: null,
  puntosCliente: 0,
  nivelCliente: "MENUDEO",
  montoHistoricoCliente: 0,
  esMayoreo: false,

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find(
        (i) => i.codigoItem === item.codigoItem
      );
      // Si el carrito está en mayoreo, la línea nueva entra a ese precio.
      const precioUnitario = precioUnitarioEfectivo(item, state.esMayoreo);

      if (existing) {
        return {
          items: state.items.map((i) =>
            i.codigoItem === item.codigoItem
              ? {
                  ...i,
                  cantidad: i.cantidad + item.cantidad,
                  subtotalLinea:
                    (i.cantidad + item.cantidad) * i.precioUnitario,
                }
              : i
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            ...item,
            precioUnitario,
            subtotalLinea: item.cantidad * precioUnitario,
          },
        ],
      };
    }),

  removeItem: (codigoItem) =>
    set((state) => ({
      items: state.items.filter((i) => i.codigoItem !== codigoItem),
    })),

  updateQuantity: (codigoItem, cantidad) =>
    set((state) => ({
      items:
        cantidad <= 0
          ? state.items.filter((i) => i.codigoItem !== codigoItem)
          : state.items.map((i) =>
              i.codigoItem === codigoItem
                ? {
                    ...i,
                    cantidad,
                    // Respeta el modo mayoreo al cambiar la cantidad.
                    subtotalLinea:
                      cantidad * precioUnitarioEfectivo(i, state.esMayoreo),
                  }
                : i
            ),
    })),

  clearCart: () =>
    set({
      items: [],
      referenciaTransferencia: null,
      idCliente: null,
      nombreCliente: null,
      esMayoreo: false,
    }),

  setMetodoPago: (metodoPago) => set({ metodoPago }),
  setTipoVenta: (tipoVenta) => set({ tipoVenta }),
  setReferenciaTransferencia: (referenciaTransferencia) =>
    set({ referenciaTransferencia }),
  setCliente: (idCliente, nombreCliente, puntosCliente, nivelCliente, montoHistoricoCliente) =>
    set({
      idCliente,
      nombreCliente,
      puntosCliente: idCliente ? (puntosCliente ?? 0) : 0,
      nivelCliente: idCliente ? (nivelCliente ?? "MENUDEO") : "MENUDEO",
      montoHistoricoCliente: idCliente ? (montoHistoricoCliente ?? 0) : 0,
    }),

  setEsMayoreo: (esMayoreo) =>
    set((state) => ({
      esMayoreo,
      // Repricing integral SIN perder el precio de menudeo: `precioUnitario`
      // siempre guarda el precio de lista y `subtotalLinea` se recalcula con
      // el precio efectivo del modo actual (así volver a menudeo es exacto).
      items: state.items.map((i) => {
        const precio = precioUnitarioEfectivo(i, esMayoreo);
        return { ...i, subtotalLinea: i.cantidad * precio };
      }),
    })),

  getTieneMayoreo: () =>
    get().items.some((i) => {
      const m = Number(i.precioMayoreo);
      return Number.isFinite(m) && m > 0;
    }),

  getTotales: () => totalesCarrito(get().items),

  // Base sin impuestos (con precios que ya incluyen IVA es menor al importe).
  getSubtotal: () => get().getTotales().subtotal,

  getIVA: () => get().getTotales().iva,

  getTotal: () => get().getTotales().total,

  getItemCount: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.cantidad, 0);
  },
}));
