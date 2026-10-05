import { describe, expect, it, beforeEach } from "vitest";
import { useCartStore, precioUnitarioEfectivo, type CartItem } from "@/store/cart";

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    codigoItem: "PROD-001",
    descripcion: "Lápiz HB",
    precioUnitario: 12.5,
    cantidad: 2,
    subtotalLinea: 25,
    precioMayoreo: 10,
    ...overrides,
  };
}

describe("precioUnitarioEfectivo", () => {
  it("devuelve el precio de menudeo cuando la venta no es a mayoreo", () => {
    expect(precioUnitarioEfectivo({ precioUnitario: 12.5, precioMayoreo: 10 }, false)).toBe(12.5);
  });

  it("devuelve el precio de mayoreo cuando la venta es a mayoreo", () => {
    expect(precioUnitarioEfectivo({ precioUnitario: 12.5, precioMayoreo: 10 }, true)).toBe(10);
  });

  it("cae a menudeo si el producto no tiene precio de mayoreo", () => {
    expect(precioUnitarioEfectivo({ precioUnitario: 12.5, precioMayoreo: null }, true)).toBe(12.5);
    expect(precioUnitarioEfectivo({ precioUnitario: 12.5, precioMayoreo: undefined }, true)).toBe(12.5);
  });

  it("nunca devuelve NaN con precios corruptos", () => {
    expect(precioUnitarioEfectivo({ precioUnitario: undefined as any, precioMayoreo: null }, true)).toBe(0);
    expect(precioUnitarioEfectivo({ precioUnitario: "abc" as any, precioMayoreo: 8 }, true)).toBe(8);
    expect(precioUnitarioEfectivo({ precioUnitario: NaN, precioMayoreo: NaN }, true)).toBe(0);
    // Un mayoreo de 0 significa "sin mayoreo", no "gratis".
    expect(precioUnitarioEfectivo({ precioUnitario: 12.5, precioMayoreo: 0 }, true)).toBe(12.5);
  });
});

describe("useCartStore · interruptor de mayoreo", () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
    useCartStore.getState().setEsMayoreo(false);
  });

  it("reprecia todo el carrito y vuelve exacto al volver a menudeo", () => {
    const { addItem, setEsMayoreo, getSubtotal, getTotal } = useCartStore.getState();

    addItem({
      codigoItem: "PROD-001",
      descripcion: "Lápiz HB",
      precioUnitario: 12.5,
      cantidad: 2,
      precioMayoreo: 10,
    });
    expect(getSubtotal()).toBe(25);

    setEsMayoreo(true);
    // 2 × $10.00
    expect(getSubtotal()).toBe(20);
    // 20 × 1.16
    expect(getTotal()).toBeCloseTo(23.2, 2);

    // Volver a menudeo debe restaurar EXACTAMENTE el precio de lista.
    setEsMayoreo(false);
    expect(getSubtotal()).toBe(25);
    expect(useCartStore.getState().items[0].precioUnitario).toBe(12.5);
  });

  it("respeta el precio de mayoreo al agregar productos con el carrito ya en mayoreo", () => {
    const { addItem, getSubtotal } = useCartStore.getState();
    setMayoreoYRecargar();
    useCartStore.getState().setEsMayoreo(true);
    useCartStore.getState().addItem({
      codigoItem: "PROD-002",
      descripcion: "Cuaderno",
      precioUnitario: 20,
      cantidad: 1,
      precioMayoreo: 15,
    });
    expect(getSubtotal()).toBe(15);
  });

  it("un producto sin mayoreo mantiene su precio de menudeo al activar el interruptor", () => {
    const { addItem, setEsMayoreo, getSubtotal } = useCartStore.getState();
    addItem({
      codigoItem: "PROD-003",
      descripcion: "Servicio de impresión",
      precioUnitario: 50,
      cantidad: 2,
      precioMayoreo: null,
    });
    setEsMayoreo(true);
    expect(getSubtotal()).toBe(100);
  });

  it("updateQuantity respeta el modo mayoreo", () => {
    const { addItem, setEsMayoreo, updateQuantity, getSubtotal } = useCartStore.getState();
    addItem({
      codigoItem: "PROD-001",
      descripcion: "Lápiz HB",
      precioUnitario: 12.5,
      cantidad: 1,
      precioMayoreo: 10,
    });
    setEsMayoreo(true);
    updateQuantity("PROD-001", 5);
    expect(getSubtotal()).toBe(50);
  });

  it("getTieneMayoreo solo es verdadero si alguna línea tiene precio de mayoreo", () => {
    const { addItem, getTieneMayoreo } = useCartStore.getState();
    expect(getTieneMayoreo()).toBe(false);
    addItem({
      codigoItem: "PROD-004",
      descripcion: "Papel bond",
      precioUnitario: 300,
      cantidad: 1,
      precioMayoreo: null,
    });
    expect(getTieneMayoreo()).toBe(false);
    addItem({
      codigoItem: "PROD-005",
      descripcion: "Tóner",
      precioUnitario: 900,
      cantidad: 1,
      precioMayoreo: 800,
    });
    expect(getTieneMayoreo()).toBe(true);
  });

  it("clearCart reinicia el interruptor de mayoreo", () => {
    const { setEsMayoreo, clearCart } = useCartStore.getState();
    setEsMayoreo(true);
    clearCart();
    expect(useCartStore.getState().esMayoreo).toBe(false);
  });
});

function setMayoreoYRecargar() {
  useCartStore.getState().clearCart();
}