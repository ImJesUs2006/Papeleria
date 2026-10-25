import { create } from "zustand";
import { fiscalCliente } from "@/store/config";
import { notificar } from "@/store/notificaciones";
import { precioPorCantidad, type EscalaPrecio } from "@/lib/precios";
import { calcularImpuestos, tasasProducto, type ResumenFiscal } from "@/lib/impuestos";
import {
  aplicarDescuentos,
  type DescuentoManual,
  type PromocionVigente,
  type ResumenPrecios,
} from "@/lib/descuentos";

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
  /** Precios por volumen: el precio baja al llegar a cada escala (lib/precios). */
  escalasPrecio?: EscalaPrecio[] | null;
  /** Fase 12: imagen del producto (Cloudinary) para el catálogo táctil. */
  imagenUrl?: string | null;
  /** Impuestos del producto: IVA propio (null = el del negocio), exento, IEPS. */
  tasaIva?: number | null;
  exentoIva?: boolean;
  tasaIeps?: number | null;
  /** Categoría (para promociones por categoría). */
  idCategoria?: string | null;
  /** Descuento manual de la línea (porcentaje o monto). */
  descuento?: DescuentoManual | null;
  /** Producto con número de serie: la cantidad es el número de series. */
  usaSeries?: boolean;
  series?: string[];
}

export interface TotalesCarrito extends ResumenFiscal {
  /** Promociones y descuentos aplicados, por línea y en total. */
  precios: ResumenPrecios;
  descuentoTotal: number;
}

/**
 * Totales de un carrito con los MISMOS motores que usa el servidor:
 * promociones y descuentos primero; después impuestos sobre lo descontado
 * (IVA por producto, IEPS, precios con impuestos incluidos).
 */
export function totalesCarrito(
  items: Array<
    Pick<CartItem, "codigoItem" | "cantidad" | "subtotalLinea" | "tasaIva" | "exentoIva" | "tasaIeps"> &
      Partial<Pick<CartItem, "idCategoria" | "descuento">>
  >,
  opciones: { promociones?: PromocionVigente[]; descuentoTicket?: DescuentoManual | null } = {}
): TotalesCarrito {
  const { ivaNegocio, preciosIncluyenIva, cobraImpuestos } = fiscalCliente();
  const precios = aplicarDescuentos(
    items.map((i) => {
      const cantidad = Number(i.cantidad) || 0;
      return {
        codigoItem: i.codigoItem,
        idCategoria: i.idCategoria ?? null,
        cantidad,
        // Precio efectivo de la línea (respeta el modo mayoreo).
        precio: cantidad > 0 ? Number(i.subtotalLinea) / cantidad : 0,
        descuento: i.descuento ?? null,
      };
    }),
    opciones.promociones ?? [],
    opciones.descuentoTicket ?? null
  );
  const fiscal = calcularImpuestos(
    precios.lineas.map((pl, k) => ({
      importe: pl.importeNeto,
      ...tasasProducto(items[k], ivaNegocio, cobraImpuestos),
    })),
    { preciosIncluyenIva }
  );
  return {
    ...fiscal,
    precios,
    descuentoTotal: Math.round((precios.totalPromociones + precios.totalManual) * 100) / 100,
  };
}

export type MetodoPagoPOS = "EFECTIVO" | "TARJETA" | "DIGITAL" | "PUNTOS_MONEDERO";

/**
 * Precio unitario efectivo de una línea según el modo de venta.
 * Nunca devuelve NaN/undefined: si no hay precio de mayoreo, cae a menudeo.
 */
export function precioUnitarioEfectivo(
  item: Pick<CartItem, "precioUnitario" | "precioMayoreo" | "escalasPrecio">,
  esMayoreo: boolean,
  cantidad = 1
): number {
  // Mismas reglas que el servidor: escala por cantidad y "cliente mayorista".
  return precioPorCantidad(item, cantidad, esMayoreo);
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
  /** Descuento manual al ticket completo. */
  descuentoTicket: DescuentoManual | null;
  /** Promociones vigentes del negocio (se cargan al abrir el POS). */
  promociones: PromocionVigente[];
  /** Producto con serie esperando que se escanee su número. */
  pendienteSerie: Omit<CartItem, "subtotalLinea"> | null;
  cancelarSerie: () => void;
  quitarSerie: (codigoItem: string, serie: string) => void;

  addItem: (item: Omit<CartItem, "subtotalLinea">) => void;
  removeItem: (codigoItem: string) => void;
  updateQuantity: (codigoItem: string, cantidad: number) => void;
  clearCart: () => void;
  setDescuentoLinea: (codigoItem: string, descuento: DescuentoManual | null) => void;
  setDescuentoTicket: (descuento: DescuentoManual | null) => void;
  setPromociones: (promociones: PromocionVigente[]) => void;
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

  /** Desglose completo: descuentos, base, IEPS, IVA y total a pagar. */
  getTotales: () => TotalesCarrito;
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
  descuentoTicket: null,
  promociones: [],
  pendienteSerie: null,
  cancelarSerie: () => set({ pendienteSerie: null }),
  quitarSerie: (codigoItem, serie) =>
    set((state) => ({
      items: state.items
        .map((i) => {
          if (i.codigoItem !== codigoItem) return i;
          const series = (i.series ?? []).filter((s) => s !== serie);
          const precio = precioUnitarioEfectivo(i, state.esMayoreo, series.length);
          return { ...i, series, cantidad: series.length, subtotalLinea: series.length * precio };
        })
        .filter((i) => !i.usaSeries || i.cantidad > 0),
    })),

  addItem: (item) => {
    const antes = get().items.length + get().items.reduce((a, i) => a + i.cantidad, 0);
    set((state) => {
      // Producto con número de serie: primero se escanea la serie.
      if (item.usaSeries && !(item.series && item.series.length)) {
        return { pendienteSerie: item };
      }
      const existing = state.items.find(
        (i) => i.codigoItem === item.codigoItem
      );
      // `precioUnitario` guarda SIEMPRE el precio de lista; el importe usa el
      // precio efectivo (escala por cantidad / cliente mayorista).
      const precioLista = Number(item.precioUnitario) || 0;

      if (existing && item.usaSeries) {
        const series = [...new Set([...(existing.series ?? []), ...(item.series ?? [])])];
        return {
          pendienteSerie: null,
          items: state.items.map((i) =>
            i.codigoItem === item.codigoItem
              ? {
                  ...i,
                  series,
                  cantidad: series.length,
                  subtotalLinea: series.length * precioUnitarioEfectivo(i, state.esMayoreo, series.length),
                }
              : i
          ),
        };
      }
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.codigoItem === item.codigoItem
              ? {
                  ...i,
                  cantidad: i.cantidad + item.cantidad,
                  subtotalLinea:
                    (i.cantidad + item.cantidad) *
                    precioUnitarioEfectivo(i, state.esMayoreo, i.cantidad + item.cantidad),
                }
              : i
          ),
        };
      }

      const cantidad = item.usaSeries ? (item.series ?? []).length : item.cantidad;
      return {
        pendienteSerie: null,
        items: [
          ...state.items,
          {
            ...item,
            cantidad,
            precioUnitario: precioLista,
            subtotalLinea: cantidad * precioUnitarioEfectivo(item, state.esMayoreo, cantidad),
          },
        ],
      };
    });
    // Aviso deslizante: confirma que el producto entró (venga del escáner,
    // de la búsqueda manual o del catálogo táctil).
    const despues = get().items.length + get().items.reduce((a, i) => a + i.cantidad, 0);
    if (despues !== antes) {
      const linea = get().items.find((i) => i.codigoItem === item.codigoItem);
      notificar.exito(
        `${item.descripcion} agregado`,
        linea ? `Cantidad en el carrito: ${linea.cantidad}` : undefined
      );
    }
  },

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
                      cantidad * precioUnitarioEfectivo(i, state.esMayoreo, cantidad),
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
      descuentoTicket: null,
    }),

  setDescuentoLinea: (codigoItem, descuento) =>
    set((state) => ({
      items: state.items.map((i) => (i.codigoItem === codigoItem ? { ...i, descuento } : i)),
    })),
  setDescuentoTicket: (descuentoTicket) => set({ descuentoTicket }),
  setPromociones: (promociones) => set({ promociones }),

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
        const precio = precioUnitarioEfectivo(i, esMayoreo, i.cantidad);
        return { ...i, subtotalLinea: i.cantidad * precio };
      }),
    })),

  getTieneMayoreo: () =>
    get().items.some((i) => {
      const m = Number(i.precioMayoreo);
      return (Number.isFinite(m) && m > 0) || (i.escalasPrecio?.length ?? 0) > 0;
    }),

  getTotales: () =>
    totalesCarrito(get().items, {
      promociones: get().promociones,
      descuentoTicket: get().descuentoTicket,
    }),

  // Base sin impuestos (con precios que ya incluyen IVA es menor al importe).
  getSubtotal: () => get().getTotales().subtotal,

  getIVA: () => get().getTotales().iva,

  getTotal: () => get().getTotales().total,

  getItemCount: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.cantidad, 0);
  },
}));
