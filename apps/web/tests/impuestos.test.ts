import { describe, expect, it, vi } from "vitest";
import { calcularImpuestos, tasasProducto } from "@/lib/impuestos";
import { executeSale } from "@/lib/sales";
import { executeReturn } from "@/lib/returns";

// ============================================================
// Motor de impuestos: IVA por producto (16 / 8 / 0 / exento), IEPS y
// precios que ya incluyen impuestos.
// ============================================================

const L = (importe: number, tasaIva = 16, tasaIeps = 0) => ({ importe, tasaIva, tasaIeps });

describe("tasasProducto", () => {
  it("hereda la tasa del negocio cuando el producto no define la suya", () => {
    expect(tasasProducto({}, 16)).toEqual({ tasaIva: 16, tasaIeps: 0 });
    expect(tasasProducto({ tasaIva: null }, 8)).toEqual({ tasaIva: 8, tasaIeps: 0 });
  });

  it("respeta tasa 0%, exento e IEPS", () => {
    expect(tasasProducto({ tasaIva: 0 }, 16).tasaIva).toBe(0);
    expect(tasasProducto({ tasaIva: 16, exentoIva: true }, 16).tasaIva).toBe(0);
    expect(tasasProducto({ tasaIeps: 8 }, 16)).toEqual({ tasaIva: 16, tasaIeps: 8 });
  });

  it("ignora tasas inválidas", () => {
    expect(tasasProducto({ tasaIva: -5, tasaIeps: 500 }, 16)).toEqual({ tasaIva: 16, tasaIeps: 0 });
  });
});

describe("calcularImpuestos · impuestos sumados al precio", () => {
  it("con una sola tasa coincide con el cálculo por ticket", () => {
    const r = calcularImpuestos([L(25)], { preciosIncluyenIva: false });
    expect(r).toMatchObject({ subtotal: 25, iva: 4, ieps: 0, total: 29 });
  });

  it("redondea por grupo de tasa, no por línea", () => {
    // 3 líneas de $0.33 al 16%: por línea darían 0.05 c/u = 0.15; por grupo 0.16.
    const r = calcularImpuestos([L(0.33), L(0.33), L(0.33)], { preciosIncluyenIva: false });
    expect(r.subtotal).toBe(0.99);
    expect(r.iva).toBe(0.16);
    expect(r.total).toBe(1.15);
    expect(r.lineas.reduce((a, l) => a + Math.round(l.iva * 100), 0)).toBe(16);
  });

  it("mezcla tasa 16%, tasa 0% y exento en el mismo ticket", () => {
    const r = calcularImpuestos([L(100, 16), L(50, 0), L(30, 0)], { preciosIncluyenIva: false });
    expect(r.subtotal).toBe(180);
    expect(r.iva).toBe(16);
    expect(r.total).toBe(196);
    expect(r.lineas[1].iva).toBe(0);
  });

  it("el IVA se causa sobre la base más el IEPS", () => {
    const r = calcularImpuestos([L(100, 16, 8)], { preciosIncluyenIva: false });
    expect(r.ieps).toBe(8);
    expect(r.iva).toBe(17.28);
    expect(r.total).toBe(125.28);
  });
});

describe("calcularImpuestos · precios con impuestos incluidos", () => {
  it("el cliente paga exactamente el precio de etiqueta", () => {
    const r = calcularImpuestos([L(116)], { preciosIncluyenIva: true });
    expect(r).toMatchObject({ subtotal: 100, iva: 16, total: 116 });
  });

  it("cuadra al centavo con importes que no dividen exacto", () => {
    const r = calcularImpuestos([L(10), L(10), L(10)], { preciosIncluyenIva: true });
    expect(r.total).toBe(30);
    expect(r.subtotal).toBe(25.86);
    expect(r.iva).toBe(4.14);
    for (const l of r.lineas) {
      expect(Math.round((l.base + l.iva + l.ieps) * 100)).toBe(1000);
    }
  });

  it("un producto exento no desglosa IVA", () => {
    const r = calcularImpuestos([L(50, 0)], { preciosIncluyenIva: true });
    expect(r).toMatchObject({ subtotal: 50, iva: 0, total: 50 });
  });

  it("desglosa IEPS e IVA hacia atrás", () => {
    const r = calcularImpuestos([L(125.28, 16, 8)], { preciosIncluyenIva: true });
    expect(r).toMatchObject({ subtotal: 100, ieps: 8, iva: 17.28, total: 125.28 });
  });

  it("carrito vacío", () => {
    expect(calcularImpuestos([], { preciosIncluyenIva: true })).toMatchObject({
      subtotal: 0,
      iva: 0,
      ieps: 0,
      total: 0,
    });
  });
});

function txVenta(productos: Record<string, any>) {
  return {
    producto: {
      findUnique: vi.fn(async ({ where }: any) => productos[where.codigoItem]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    venta: { create: vi.fn(async () => ({})) },
    lineaDetalleVenta: { create: vi.fn(async () => ({})) },
    sesionCaja: {
      findUnique: vi.fn(async () => ({ estado: "ABIERTA" })),
      update: vi.fn(async () => ({})),
    },
    movimientoKardex: { createMany: vi.fn(async () => ({ count: 0 })) },
    bitacoraLog: { create: vi.fn(async () => ({})) },
  } as any;
}

const base = { activo: true, esServicio: false, permiteDecimales: false, stockActual: 50 };

describe("executeSale · impuestos por producto", () => {
  it("vende medicina a tasa 0% junto a un producto gravado", async () => {
    const tx = txVenta({
      MED: { ...base, codigoItem: "MED", descripcion: "Paracetamol", precioUnitario: 50, tasaIva: 0 },
      JAB: { ...base, codigoItem: "JAB", descripcion: "Jabón", precioUnitario: 100 },
    });
    const r = await executeSale(
      tx,
      {
        items: [
          { codigoItem: "MED", cantidad: 2 },
          { codigoItem: "JAB", cantidad: 1 },
        ],
        metodoPago: "EFECTIVO",
      },
      { idUsuario: "u1", idCaja: "c1", ivaRate: 16 }
    );
    expect(r).toMatchObject({ subtotal: 200, iva: 16, ieps: 0, totalNeto: 216 });
    expect(tx.lineaDetalleVenta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigoItem: "MED", tasaIva: 0, ivaLinea: 0, subtotalLinea: 100 }),
    });
    expect(tx.lineaDetalleVenta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ codigoItem: "JAB", tasaIva: 16, ivaLinea: 16 }),
    });
  });

  it("con precios que incluyen IVA cobra la etiqueta y guarda la base", async () => {
    const tx = txVenta({
      JAB: { ...base, codigoItem: "JAB", descripcion: "Jabón", precioUnitario: 116 },
    });
    const r = await executeSale(
      tx,
      { items: [{ codigoItem: "JAB", cantidad: 1 }], metodoPago: "EFECTIVO", montoRecibido: 116 },
      { idUsuario: "u1", idCaja: "c1", ivaRate: 16, preciosIncluyenIva: true }
    );
    expect(r).toMatchObject({ subtotal: 100, iva: 16, totalNeto: 116, cambio: 0 });
    expect(tx.venta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ subtotal: 100, iva: 16, ieps: 0, totalNeto: 116 }),
    });
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "c1" },
      data: { totalVentasEfectivo: { increment: 116 } },
    });
  });

  it("registra el IEPS de la venta", async () => {
    const tx = txVenta({
      REF: { ...base, codigoItem: "REF", descripcion: "Refresco", precioUnitario: 100, tasaIeps: 8 },
    });
    const r = await executeSale(
      tx,
      { items: [{ codigoItem: "REF", cantidad: 1 }], metodoPago: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", ivaRate: 16 }
    );
    expect(r).toMatchObject({ subtotal: 100, ieps: 8, iva: 17.28, totalNeto: 125.28 });
  });
});

describe("executeReturn · impuestos por línea", () => {
  it("devuelve los impuestos que realmente se cobraron en cada línea", async () => {
    const venta = {
      folioVenta: "F-1",
      estado: "COMPLETADA",
      metodoPago: "EFECTIVO",
      subtotal: 300,
      iva: 16,
      lineasDetalle: [
        // 2 medicinas a tasa 0% y 1 refresco con IEPS + IVA.
        { codigoItem: "MED", cantidad: 2, precioMomento: 100, subtotalLinea: 200, ivaLinea: 0, iepsLinea: 0 },
        { codigoItem: "REF", cantidad: 1, precioMomento: 100, subtotalLinea: 100, ivaLinea: 17.28, iepsLinea: 8 },
      ],
      devoluciones: [],
    };
    const tx = {
      venta: { findUnique: vi.fn().mockResolvedValue(venta), update: vi.fn().mockResolvedValue({}) },
      producto: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
      sesionCaja: {
        findUnique: vi.fn().mockResolvedValue({ estado: "ABIERTA" }),
        update: vi.fn().mockResolvedValue({}),
      },
      devolucion: { create: vi.fn().mockResolvedValue({}) },
      movimientoKardex: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      cliente: { findUnique: vi.fn(), update: vi.fn() },
      bitacoraLog: { create: vi.fn().mockResolvedValue({}) },
    } as any;

    const med = await executeReturn(
      tx,
      { folioVenta: "F-1", items: [{ codigoItem: "MED", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", ivaRate: 16 }
    );
    expect(med).toMatchObject({ subtotal: 100, iva: 0, ieps: 0, totalNeto: 100 });

    const ref = await executeReturn(
      tx,
      { folioVenta: "F-1", items: [{ codigoItem: "REF", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", ivaRate: 16 }
    );
    expect(ref).toMatchObject({ subtotal: 100, iva: 17.28, ieps: 8, totalNeto: 125.28 });
  });
});
