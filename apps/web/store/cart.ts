import { create } from "zustand";

export interface CartItem {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  cantidad: number;
  subtotalLinea: number;
  tipoImpresion?: string;
}

interface CartState {
  items: CartItem[];
  metodoPago: "EFECTIVO" | "TARJETA" | "DIGITAL" | "CREDITO_TIENDA";
  tipoVenta: "PAPELERIA" | "RECARGA";
  /** Blindaje Financiero: últimos 4 dígitos del rastreo de transferencia. */
  referenciaTransferencia: string | null;
  /** CRM (Fase 3): cliente asignado a una venta a crédito. */
  idCliente: string | null;
  nombreCliente: string | null;

  addItem: (item: Omit<CartItem, "subtotalLinea">) => void;
  removeItem: (codigoItem: string) => void;
  updateQuantity: (codigoItem: string, cantidad: number) => void;
  clearCart: () => void;
  setMetodoPago: (metodo: "EFECTIVO" | "TARJETA" | "DIGITAL" | "CREDITO_TIENDA") => void;
  setTipoVenta: (tipo: "PAPELERIA" | "RECARGA") => void;
  setReferenciaTransferencia: (referencia: string | null) => void;
  setCliente: (idCliente: string | null, nombreCliente: string | null) => void;

  getSubtotal: () => number;
  getIVA: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

const IVA_RATE = 0.16;

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  metodoPago: "EFECTIVO",
  tipoVenta: "PAPELERIA",
  referenciaTransferencia: null,
  idCliente: null,
  nombreCliente: null,

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find(
        (i) => i.codigoItem === item.codigoItem
      );

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
          { ...item, subtotalLinea: item.cantidad * item.precioUnitario },
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
                ? { ...i, cantidad, subtotalLinea: cantidad * i.precioUnitario }
                : i
            ),
    })),

  clearCart: () => set({ items: [], referenciaTransferencia: null, idCliente: null, nombreCliente: null }),

  setMetodoPago: (metodoPago) => set({ metodoPago }),
  setTipoVenta: (tipoVenta) => set({ tipoVenta }),
  setReferenciaTransferencia: (referenciaTransferencia) =>
    set({ referenciaTransferencia }),
  setCliente: (idCliente, nombreCliente) => set({ idCliente, nombreCliente }),

  getSubtotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.subtotalLinea, 0);
  },

  getIVA: () => {
    const subtotal = get().getSubtotal();
    return subtotal * IVA_RATE;
  },

  getTotal: () => {
    const subtotal = get().getSubtotal();
    return subtotal * (1 + IVA_RATE);
  },

  getItemCount: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.cantidad, 0);
  },
}));
