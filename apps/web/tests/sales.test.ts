import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/ventas/route";

vi.mock("@/lib/auth", () => ({
  requireAuth: () => async () => ({
    user: {
      idPersona: "usuario-test",
      nombre: "Admin Test",
      username: "admin",
      rol: "ADMINISTRADORA",
    },
  }),
}));

function crearProducto(overrides = {}) {
  return {
    codigoItem: "PROD-001",
    descripcion: "Lápiz HB",
    precioUnitario: 12.5,
    stockActual: 5,
    activo: true,
    ...overrides,
  };
}

function crearTxMock(producto: any) {
  return {
    producto: {
      findUnique: vi.fn(async () => producto),
      update: vi.fn(async () => producto),
    },
    venta: { create: vi.fn(async () => ({ folioVenta: "F-TEST" })) },
    lineaDetalleVenta: { create: vi.fn(async () => ({})) },
    sesionCaja: {
      findUnique: vi.fn(async () => ({ estado: "ABIERTA" })),
      update: vi.fn(async () => ({})),
    },
    bitacoraLog: { create: vi.fn(async () => ({})) },
  };
}

describe("POST /api/ventas", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("devuelve 400 si se intenta vender más stock del disponible", async () => {
    const tx = crearTxMock(crearProducto({ stockActual: 1 }));
    const prisma = {
      configuracionNegocio: { findUnique: vi.fn(async () => null) },
      sesionCaja: { findFirst: vi.fn(async () => null) },
      $transaction: vi.fn(async (cb: any) => cb(tx as any)),
    };
    vi.doMock("@papeleria/database", () => ({ prisma }));

    const { POST: POSTReal } = await import("@/app/api/ventas/route");
    const res = await POSTReal(
      new Request("http://localhost/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ codigoItem: "PROD-001", cantidad: 2 }],
          metodoPago: "EFECTIVO",
        }),
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Stock insuficiente/i);
    // No debe registrarse venta alguna
    expect(tx.venta.create).not.toHaveBeenCalled();
    expect(tx.producto.update).not.toHaveBeenCalled();
  });

  it("registra la venta, descuenta stock y asigna ingreso a la caja", async () => {
    const tx = crearTxMock(crearProducto({ stockActual: 5 }));
    const prisma = {
      configuracionNegocio: { findUnique: vi.fn(async () => null) },
      sesionCaja: { findFirst: vi.fn(async () => ({ idCaja: "CAJA-1" })) },
      $transaction: vi.fn(async (cb: any) => cb(tx as any)),
    };
    vi.doMock("@papeleria/database", () => ({ prisma }));

    const { POST: POSTReal } = await import("@/app/api/ventas/route");
    const res = await POSTReal(
      new Request("http://localhost/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ codigoItem: "PROD-001", cantidad: 2 }],
          metodoPago: "EFECTIVO",
          montoRecibido: 50,
        }),
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();

    // 2 x $12.50 = 25.00 subtotal, IVA 16% = 4.00, total 29.00
    expect(body.subtotal).toBe(25);
    expect(body.iva).toBe(4);
    expect(body.totalNeto).toBe(29);
    expect(body.cambio).toBe(21);
    expect(body.folioVenta).toMatch(/^F-\d{8}-[A-Z0-9]{4}$/);

    // Descuento de stock exacto
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { codigoItem: "PROD-001" },
      data: { stockActual: { decrement: 2 } },
    });
    // Línea de detalle con los precios congelados
    expect(tx.lineaDetalleVenta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folioVenta: body.folioVenta,
          cantidad: 2,
          subtotalLinea: 25,
        }),
      })
    );
    // Ingreso asignado al efectivo de la caja
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "CAJA-1" },
      data: { totalVentasEfectivo: { increment: 29 } },
    });
    // Log en bitácora
    expect(tx.bitacoraLog.create).toHaveBeenCalled();
  });

  it("asigna la venta de recarga al flujo de recargas", async () => {
    const tx = crearTxMock(crearProducto({ stockActual: 5 }));
    const prisma = {
      configuracionNegocio: { findUnique: vi.fn(async () => null) },
      sesionCaja: { findFirst: vi.fn(async () => ({ idCaja: "CAJA-1" })) },
      $transaction: vi.fn(async (cb: any) => cb(tx as any)),
    };
    vi.doMock("@papeleria/database", () => ({ prisma }));

    const { POST: POSTReal } = await import("@/app/api/ventas/route");
    await POSTReal(
      new Request("http://localhost/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ codigoItem: "PROD-001", cantidad: 1 }],
          metodoPago: "EFECTIVO",
          tipoVenta: "RECARGA",
        }),
      })
    );

    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "CAJA-1" },
      data: { totalRecargas: { increment: 14.5 } },
    });
  });
});