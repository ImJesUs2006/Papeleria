"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@/store/cart";

// ============================================================
// Espejo local de inventario para la operación OFFLINE.
// No es autoritativo: sirve para que el POS no permita vender
// más de lo que el cliente observó al desconectarse y para
// descontar stock en la UI. El servidor re-resuelve en sync.
// ============================================================

export interface ItemStockLocal {
  codigoItem: string;
  descripcion: string;
  precioUnitario: number;
  stockActual: number;
  stockMinimo: number;
  imagenMime?: string | null;
  imagenBase64?: string | null;
}

interface InventoryState {
  items: Record<string, ItemStockLocal>;
  setItem: (item: ItemStockLocal) => void;
  setMany: (items: ItemStockLocal[]) => void;
  getStock: (codigoItem: string) => number;
  descontarStock: (cart: CartItem[]) => void;
  reabastecer: (codigoItem: string, cantidad: number) => void;
  clear: () => void;
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      items: {},

      setItem: (item) =>
        set((s) => ({ items: { ...s.items, [item.codigoItem]: item } })),

      setMany: (items) =>
        set((s) => {
          const next = { ...s.items };
          for (const i of items) next[i.codigoItem] = i;
          return { items: next };
        }),

      getStock: (codigoItem) => get().items[codigoItem]?.stockActual ?? 0,

      descontarStock: (cart) =>
        set((s) => {
          const next = { ...s.items };
          for (const item of cart) {
            const actual = next[item.codigoItem];
            if (actual) {
              next[item.codigoItem] = {
                ...actual,
                stockActual: Math.max(-999, actual.stockActual - item.cantidad),
              };
            }
          }
          return { items: next };
        }),

      reabastecer: (codigoItem, cantidad) =>
        set((s) => {
          const actual = s.items[codigoItem];
          if (!actual) return s;
          return {
            items: {
              ...s.items,
              [codigoItem]: { ...actual, stockActual: actual.stockActual + cantidad },
            },
          };
        }),

      clear: () => set({ items: {} }),
    }),
    {
      name: "papeleria-inventario-local",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export function obtenerInventarioLocal() {
  return useInventoryStore.getState();
}