import { describe, expect, it, vi, beforeEach } from "vitest";

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
    codigoItem: "SERV-001",
    descripcion: "Consultoría de cómputo",
    precioUnitario: 200,
    stockActual: 0,
    activo: true,
    esServicio: false,
    permiteDecimales: false,
    ...overrides,
  };
}

function crearTxMock(producto: any) {
  return {
    producto: {
      findUnique: vi.fn(async () => producto),
      update: vi.fn(async () => producto),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    venta: { create: vi.fn(async () => ({ folioVenta: "F-TEST" })) },
    lineaDetalleVenta: { create: vi.fn(async () => ({})) },
    sesionCaja: {
      findUnique: vi.fn(async () => ({ estado: "ABIERTA" })),
      update: vi.fn(async () => ({})),
    },
    movimientoKardex: { createMany: vi.fn(async () => ({ count: 0 })) },
    bitacoraLog: { create: vi.fn(async () => ({})) },
  };
}

async function postVenta(tx: any, body: any) {
  const prisma = {
    configuracionNegocio: { findUnique: vi.fn(async () => null) },
    // Desde la auditoría de caja, toda venta exige una sesión ABIERTA.
    sesionCaja: { findFirst: vi.fn(async () => ({ idCaja: "CAJA-1" })) },
    $transaction: vi.fn(async (cb: any) => cb(tx as any)),
  };
  vi.doMock("@papeleria/database", () => ({ prisma }));

  const { POST } = await import("@/app/api/ventas/route");
  return POST(
    new Request("http://localhost/api/ventas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

describe("Venta de servicios (esServicio) y granel (permiteDecimales) — C2", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("vende un servicio sin stock disponible sin validar inventario ni kardex", async () => {
    const tx = crearTxMock(crearProducto({ esServicio: true, stockActual: 0 }));
    const res = await postVenta(tx, {
      items: [{ codigoItem: "SERV-001", cantidad: 1 }],
      metodoPago: "EFECTIVO",
      montoRecibido: 300,
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    // 200 subtotal + 16% = 232
    expect(body.totalNeto).toBe(232);

    // Un servicio NO descuenta stock
    expect(tx.producto.updateMany).not.toHaveBeenCalled();
    // Y NO genera movimiento físico de kardex
    expect(tx.movimientoKardex.createMany).not.toHaveBeenCalled();
  });

  it("permite cantidad fraccionada solo en productos con decimales habilitados", async () => {
    const tx = crearTxMock(
      crearProducto({ codigoItem: "GRANEL-1", permiteDecimales: true, stockActual: 5 })
    );
    const res = await postVenta(tx, {
      items: [{ codigoItem: "GRANEL-1", cantidad: 1.5 }],
      metodoPago: "EFECTIVO",
    });

    expect(res.status).toBe(201);
    // 12.50? no: el producto base cuesta 200; 1.5 x 200 = 300 + 16% = 348
    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: { codigoItem: "GRANEL-1", stockActual: { gte: 1.5 } },
      data: { stockActual: { decrement: 1.5 } },
    });
    expect(tx.movimientoKardex.createMany).toHaveBeenCalled();
    const createManyMock = tx.movimientoKardex.createMany as unknown as {
    mock: { calls: Array<Array<{ data: Array<{ cantidadCambio: number }> }>> };
  };
    const kardex = createManyMock.mock.calls[0][0].data[0];
    expect(kardex.cantidadCambio).toBe(-1.5);
  });

  it("rechaza cantidad fraccionada en un producto de unidades enteras", async () => {
    const tx = crearTxMock(
      crearProducto({ codigoItem: "ENTERO-1", permiteDecimales: false, stockActual: 5 })
    );
    const res = await postVenta(tx, {
      items: [{ codigoItem: "ENTERO-1", cantidad: 1.5 }],
      metodoPago: "EFECTIVO",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/número entero/i);
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("un servicio no consume stock aunque la cantidad exija fracción", async () => {
    const tx = crearTxMock(crearProducto({ esServicio: true, permiteDecimales: true }));
    const res = await postVenta(tx, {
      items: [{ codigoItem: "SERV-001", cantidad: 0.25 }],
      metodoPago: "EFECTIVO",
    });

    expect(res.status).toBe(201);
    expect(tx.producto.updateMany).not.toHaveBeenCalled();
  });
});