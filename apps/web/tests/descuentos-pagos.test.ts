import { describe, expect, it, vi } from "vitest";
import { aplicarDescuentos, normalizarDescuento, promocionVigente } from "@/lib/descuentos";
import { normalizarPagos, PagoError } from "@/lib/pagos";
import { validarPromocion, PromocionError } from "@/lib/promociones";
import { executeSale, SaleError } from "@/lib/sales";

// ============================================================
// Paso 3: promociones, descuentos manuales con tope y pagos mixtos.
// ============================================================

const L = (codigoItem: string, cantidad: number, precio: number, extra: any = {}) => ({
  codigoItem,
  cantidad,
  precio,
  ...extra,
});

describe("aplicarDescuentos", () => {
  it("sin promociones ni descuentos deja el importe igual", () => {
    const r = aplicarDescuentos([L("A", 2, 50)], []);
    expect(r).toMatchObject({ totalBruto: 100, totalNeto: 100, totalManual: 0, totalPromociones: 0 });
  });

  it("aplica la promoción que más descuenta", () => {
    const r = aplicarDescuentos(
      [L("A", 3, 10)],
      [
        { idPromocion: "1", nombre: "10% todo", tipo: "PORCENTAJE", valor: 10 },
        { idPromocion: "2", nombre: "3x2 en A", tipo: "NXM", llevaN: 3, pagaM: 2, codigoItem: "A" },
      ]
    );
    expect(r.lineas[0]).toMatchObject({ promocion: "3x2 en A", descuentoPromo: 10, importeNeto: 20 });
  });

  it("3x2 solo regala por cada grupo completo y no aplica a granel", () => {
    const promo = { idPromocion: "1", nombre: "3x2", tipo: "NXM" as const, llevaN: 3, pagaM: 2 };
    expect(aplicarDescuentos([L("A", 7, 10)], [promo]).lineas[0].descuentoPromo).toBe(20);
    expect(aplicarDescuentos([L("A", 2.5, 10)], [promo]).lineas[0].descuentoPromo).toBe(0);
  });

  it("respeta el alcance por producto y por categoría", () => {
    const r = aplicarDescuentos(
      [L("A", 1, 100, { idCategoria: "cat-1" }), L("B", 1, 100, { idCategoria: "cat-2" })],
      [{ idPromocion: "1", nombre: "Útiles", tipo: "PORCENTAJE", valor: 50, idCategoria: "cat-1" }]
    );
    expect(r.lineas.map((l) => l.importeNeto)).toEqual([50, 100]);
  });

  it("descuento manual de línea en porcentaje y en monto, sin pasar de 0", () => {
    const r = aplicarDescuentos(
      [
        L("A", 1, 100, { descuento: { tipo: "PORCENTAJE", valor: 15 } }),
        L("B", 1, 20, { descuento: { tipo: "MONTO", valor: 50 } }),
      ],
      []
    );
    expect(r.lineas.map((l) => l.importeNeto)).toEqual([85, 0]);
    expect(r.totalManual).toBe(35);
  });

  it("prorratea el descuento al ticket cuadrando al centavo", () => {
    const r = aplicarDescuentos([L("A", 1, 10), L("B", 1, 10), L("C", 1, 10)], [], {
      tipo: "MONTO",
      valor: 1,
    });
    expect(r.totalNeto).toBe(29);
    expect(r.lineas.reduce((a, l) => a + Math.round(l.descuentoTicket * 100), 0)).toBe(100);
  });

  it("el % manual se mide sobre lo que quedó tras las promociones", () => {
    const r = aplicarDescuentos(
      [L("A", 1, 100)],
      [{ idPromocion: "1", nombre: "50%", tipo: "PORCENTAJE", valor: 50 }],
      { tipo: "MONTO", valor: 10 }
    );
    expect(r.porcentajeManual).toBe(20);
  });

  it("valida la captura de descuentos", () => {
    expect(() => normalizarDescuento({ tipo: "PORCENTAJE", valor: 120 })).toThrow(/100%/);
    expect(() => normalizarDescuento({ tipo: "OTRO", valor: 1 })).toThrow(/Tipo/);
    expect(normalizarDescuento({ tipo: "MONTO", valor: 0 })).toBeNull();
  });

  it("vigencia de promociones", () => {
    const ahora = new Date("2026-10-14T12:00:00Z");
    expect(promocionVigente({ activa: true, fechaInicio: "2026-10-01", fechaFin: null }, ahora)).toBe(true);
    expect(promocionVigente({ activa: true, fechaInicio: "2026-10-20" }, ahora)).toBe(false);
    expect(promocionVigente({ activa: true, fechaInicio: "2026-10-01", fechaFin: "2026-10-10" }, ahora)).toBe(false);
    expect(promocionVigente({ activa: false, fechaInicio: "2026-10-01" }, ahora)).toBe(false);
  });
});

describe("validarPromocion", () => {
  it("acepta un 3x2 y un porcentaje", () => {
    expect(validarPromocion({ nombre: "3x2", tipo: "NXM", llevaN: 3, pagaM: 2 })).toMatchObject({ llevaN: 3, pagaM: 2 });
    expect(validarPromocion({ nombre: "Buen fin", tipo: "PORCENTAJE", valor: 15 }).valor).toBe(15);
  });

  it("un día suelto cuenta completo: inicio 00:00 y fin 23:59 locales", () => {
    const p = validarPromocion({
      nombre: "Fin de semana",
      tipo: "PORCENTAJE",
      valor: 10,
      fechaInicio: "2026-10-17",
      fechaFin: "2026-10-18",
    });
    expect([p.fechaInicio.getHours(), p.fechaInicio.getDate()]).toEqual([0, 17]);
    expect([p.fechaFin!.getHours(), p.fechaFin!.getMinutes(), p.fechaFin!.getDate()]).toEqual([23, 59, 18]);
  });

  it("rechaza capturas incoherentes", () => {
    expect(() => validarPromocion({ nombre: "x", tipo: "PORCENTAJE", valor: 10 })).toThrow(PromocionError);
    expect(() => validarPromocion({ nombre: "Mal", tipo: "NXM", llevaN: 2, pagaM: 2 })).toThrow(/N mayor que M/);
    expect(() =>
      validarPromocion({ nombre: "Ambos", tipo: "PORCENTAJE", valor: 5, codigoItem: "A", idCategoria: "c" })
    ).toThrow(/producto O una categoría/);
    expect(() =>
      validarPromocion({ nombre: "Fechas", tipo: "PORCENTAJE", valor: 5, fechaInicio: "2026-10-10", fechaFin: "2026-10-01" })
    ).toThrow(/anterior/);
  });
});

describe("normalizarPagos", () => {
  it("pago único conserva el método", () => {
    const r = normalizarPagos({ metodoPago: "EFECTIVO", montoRecibido: 50 }, 29);
    expect(r).toMatchObject({ metodoVenta: "EFECTIVO", efectivo: 29, cambio: 21 });
  });

  it("pago mixto suma exacto y el cambio sale solo del efectivo", () => {
    const r = normalizarPagos(
      {
        pagos: [
          { metodo: "TARJETA", monto: 60 },
          { metodo: "EFECTIVO", monto: 40 },
        ],
        montoRecibido: 50,
      },
      100
    );
    expect(r).toMatchObject({ metodoVenta: "MIXTO", efectivo: 40, cambio: 10 });
  });

  it("rechaza pagos que no cuadran, métodos repetidos y transferencias sin referencia", () => {
    expect(() => normalizarPagos({ pagos: [{ metodo: "EFECTIVO", monto: 90 }] }, 100)).toThrow(/suman/);
    expect(() =>
      normalizarPagos({ pagos: [{ metodo: "EFECTIVO", monto: 50 }, { metodo: "EFECTIVO", monto: 50 }] }, 100)
    ).toThrow(/una sola vez/);
    expect(() =>
      normalizarPagos({ pagos: [{ metodo: "TRANSFERENCIA", monto: 100 }] }, 100)
    ).toThrow(PagoError);
    expect(() =>
      normalizarPagos({ pagos: [{ metodo: "EFECTIVO", monto: 100 }], montoRecibido: 80 }, 100)
    ).toThrow(/no cubre/);
  });
});

function txVenta(producto: any, cliente?: any) {
  return {
    producto: {
      findUnique: vi.fn(async () => producto),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    cliente: {
      findUnique: vi.fn(async () => cliente ?? null),
      update: vi.fn(async () => ({})),
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

const cuaderno = {
  codigoItem: "C1",
  descripcion: "Cuaderno",
  precioUnitario: 100,
  stockActual: 10,
  activo: true,
  esServicio: false,
  permiteDecimales: false,
  idCategoria: null,
};

describe("executeSale · descuentos y pagos mixtos", () => {
  it("una cajera no puede pasar su tope sin autorización", async () => {
    const tx = txVenta(cuaderno);
    const venta = executeSale(
      tx,
      { items: [{ codigoItem: "C1", cantidad: 1, descuento: { tipo: "PORCENTAJE", valor: 20 } }], metodoPago: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", rol: "CAJERA", descuentoMaxCajera: 10 }
    );
    await expect(venta).rejects.toBeInstanceOf(SaleError);
    await expect(venta).rejects.toMatchObject({ status: 403, codigo: "REQUIERE_AUTORIZACION" });
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("con autorización aplica el descuento y guarda quién autorizó", async () => {
    const tx = txVenta(cuaderno);
    const r = await executeSale(
      tx,
      { items: [{ codigoItem: "C1", cantidad: 1, descuento: { tipo: "PORCENTAJE", valor: 20 } }], metodoPago: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", rol: "CAJERA", descuentoMaxCajera: 10, autorizadoPor: "admin-1" }
    );
    expect(r).toMatchObject({ subtotal: 80, iva: 12.8, totalNeto: 92.8, descuentoTotal: 20 });
    expect(tx.venta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ descuentoTotal: 20, idAutorizoDescuento: "admin-1" }),
    });
    expect(tx.lineaDetalleVenta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ precioMomento: 100, descuentoLinea: 20, subtotalLinea: 80 }),
    });
  });

  it("la administradora no tiene tope y las promociones no cuentan para el tope", async () => {
    const tx = txVenta(cuaderno);
    await expect(
      executeSale(
        tx,
        { items: [{ codigoItem: "C1", cantidad: 1 }], metodoPago: "EFECTIVO" },
        {
          idUsuario: "u1",
          idCaja: "c1",
          rol: "CAJERA",
          descuentoMaxCajera: 5,
          promociones: [{ idPromocion: "p", nombre: "Mitad", tipo: "PORCENTAJE", valor: 50 }],
        }
      )
    ).resolves.toMatchObject({ subtotal: 50, descuentoTotal: 50 });
  });

  it("pago mixto: cada parte entra a su rubro de caja", async () => {
    const tx = txVenta(cuaderno);
    const r = await executeSale(
      tx,
      {
        items: [{ codigoItem: "C1", cantidad: 1 }],
        metodoPago: "EFECTIVO",
        pagos: [
          { metodo: "TARJETA", monto: 66 },
          { metodo: "EFECTIVO", monto: 50 },
        ],
        montoRecibido: 100,
      },
      { idUsuario: "u1", idCaja: "c1" }
    );
    expect(r).toMatchObject({ totalNeto: 116, metodoPago: "MIXTO", cambio: 50 });
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "c1" },
      data: { totalVentasEfectivo: { increment: 50 }, totalVentasDigital: { increment: 66 } },
    });
    expect(tx.venta.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metodoPago: "MIXTO",
        pagos: {
          create: [
            expect.objectContaining({ metodo: "TARJETA", monto: 66 }),
            expect.objectContaining({ metodo: "EFECTIVO", monto: 50 }),
          ],
        },
      }),
    });
  });

  it("pago mixto con puntos: canjea su parte y solo el dinero acumula puntos", async () => {
    const tx = txVenta(cuaderno, { idCliente: "CLI", nombre: "Ana", puntosFidelidad: 30 });
    await executeSale(
      tx,
      {
        items: [{ codigoItem: "C1", cantidad: 1 }],
        metodoPago: "EFECTIVO",
        idCliente: "CLI",
        pagos: [
          { metodo: "PUNTOS_MONEDERO", monto: 16 },
          { metodo: "EFECTIVO", monto: 100 },
        ],
      },
      { idUsuario: "u1", idCaja: "c1", puntos: { pesosCompraPorPunto: 100, valorPuntoPesos: 1 } }
    );
    expect(tx.cliente.updateMany).toHaveBeenCalledWith({
      where: { idCliente: "CLI", puntosFidelidad: { gte: 16 } },
      data: { puntosFidelidad: { decrement: 16 } },
    });
    expect(tx.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idCliente: "CLI" },
        data: { puntosFidelidad: { increment: 1 } },
      })
    );
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "c1" },
      data: { totalVentasEfectivo: { increment: 100 } },
    });
  });

  it("rechaza pagos que no cubren el total", async () => {
    const tx = txVenta(cuaderno);
    await expect(
      executeSale(
        tx,
        { items: [{ codigoItem: "C1", cantidad: 1 }], metodoPago: "EFECTIVO", pagos: [{ metodo: "EFECTIVO", monto: 100 }] },
        { idUsuario: "u1", idCaja: "c1" }
      )
    ).rejects.toThrow(/suman/);
    expect(tx.producto.updateMany).not.toHaveBeenCalled();
  });
});

describe("montosSugeridos (billetes rápidos)", () => {
  it("ofrece el exacto y los billetes siguientes", async () => {
    const { montosSugeridos } = await import("@/lib/pagos");
    expect(montosSugeridos(137.5)).toEqual([137.5, 140, 150, 200]);
    expect(montosSugeridos(20)).toEqual([20, 50, 100, 200]);
    expect(montosSugeridos(1250)).toEqual([1250, 1300]);
  });
  it("sin total no sugiere nada", async () => {
    const { montosSugeridos } = await import("@/lib/pagos");
    expect(montosSugeridos(0)).toEqual([]);
  });
});
