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
      // Descuento atómico (UPDATE condicionado al stock disponible).
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
    expect(tx.producto.updateMany).not.toHaveBeenCalled();
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
    expect(body.folioVenta).toMatch(/^F-\d{8}-[A-Z0-9]{6}$/);

    // Descuento de stock exacto
    expect(tx.producto.updateMany).toHaveBeenCalledWith({
      where: { codigoItem: "PROD-001", stockActual: { gte: 2 } },
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

  it("exige la referencia (últimos 4 dígitos) en pagos por transferencia", async () => {
    const tx = crearTxMock(crearProducto({ stockActual: 5 }));
    const prisma = {
      configuracionNegocio: { findUnique: vi.fn(async () => null) },
      sesionCaja: { findFirst: vi.fn(async () => ({ idCaja: "CAJA-1" })) },
      $transaction: vi.fn(async (cb: any) => cb(tx as any)),
    };
    vi.doMock("@papeleria/database", () => ({ prisma }));

    const { POST: POSTReal } = await import("@/app/api/ventas/route");

    const sinReferencia = await POSTReal(
      new Request("http://localhost/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ codigoItem: "PROD-001", cantidad: 1 }],
          metodoPago: "DIGITAL",
          referenciaTransferencia: null,
        }),
      })
    );
    expect(sinReferencia.status).toBe(400);
    expect(await sinReferencia.json()).toMatchObject({
      error: expect.stringMatching(/referencia/i),
    });
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("registra la transferencia con su referencia y la asigna al flujo digital", async () => {
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
          items: [{ codigoItem: "PROD-001", cantidad: 1 }],
          metodoPago: "DIGITAL",
          referenciaTransferencia: "4821",
        }),
      })
    );

    expect(res.status).toBe(201);
    // Blindaje Financiero: la referencia queda persistida en la venta.
    expect(tx.venta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metodoPago: "DIGITAL",
          referenciaTransferencia: "4821",
        }),
      })
    );
    // El ingreso se asigna a digital (no a efectivo).
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "CAJA-1" },
      data: { totalVentasDigital: { increment: 14.5 } },
    });
    // La referencia queda en la bitácora.
    expect(tx.bitacoraLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jsonPayload: expect.objectContaining({ referenciaTransferencia: "4821" }),
        }),
      })
    );
  });
});

describe("POST /api/ventas · Puntos Monedero (Fase 12)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Config del negocio con el método habilitado y su tasa.
  const configPuntos = {
    metodosPago: ["EFECTIVO", "TARJETA_TERMINAL", "TRANSFERENCIA", "PUNTOS_MONEDERO"],
    puntosConfig: { pesosCompraPorPunto: 100, valorPuntoPesos: 1 },
  };

  function txConCliente(puntos: number, productoOverrides: any = {}) {
    return {
      producto: {
        findUnique: vi.fn(async () => crearProducto({ stockActual: 50, ...productoOverrides })),
        update: vi.fn(async () => crearProducto()),
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
      cliente: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ idCliente: "CLI-1", nombre: "María López", puntosFidelidad: puntos })),
        update: vi.fn(async () => ({})),
      },
    };
  }

  async function postVenta(tx: any, prismaConfig: any, body: any) {
    const prisma = {
      configuracionNegocio: { findUnique: vi.fn(async () => prismaConfig) },
      sesionCaja: { findFirst: vi.fn(async () => ({ idCaja: "CAJA-1" })) },
      $transaction: vi.fn(async (cb: any) => cb(tx as any)),
    };
    vi.doMock("@papeleria/database", () => ({ prisma }));
    const { POST: POSTReal } = await import("@/app/api/ventas/route");
    return POSTReal(
      new Request("http://localhost/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  }

  it("rechaza 403 el método si no está habilitado en la config", async () => {
    const tx = txConCliente(50);
    const res = await postVenta(
      tx,
      null, // config por defecto (sin PUNTOS_MONEDERO)
      { items: [{ codigoItem: "PROD-001", cantidad: 1 }], metodoPago: "PUNTOS_MONEDERO", idCliente: "CLI-1" }
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/no está habilitado/i) });
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("bloquea la venta si el saldo de puntos no alcanza el total", async () => {
    // 1 × $12.50 → total $14.50 → requiere 15 pts (valorPunto 1); el cliente tiene 10.
    const tx = txConCliente(10);
    const res = await postVenta(
      tx,
      configPuntos,
      { items: [{ codigoItem: "PROD-001", cantidad: 1 }], metodoPago: "PUNTOS_MONEDERO", idCliente: "CLI-1" }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/Puntos insuficientes/i) });
    expect(tx.venta.create).not.toHaveBeenCalled();
    expect(tx.cliente.update).not.toHaveBeenCalled();
  });

  it("exige cliente en venta con puntos", async () => {
    const tx = txConCliente(50);
    const res = await postVenta(
      tx,
      configPuntos,
      { items: [{ codigoItem: "PROD-001", cantidad: 1 }], metodoPago: "PUNTOS_MONEDERO", idCliente: null }
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/cliente/i) });
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("canjea los puntos, guarda el cliente y NO ingresa a la caja", async () => {
    const tx = txConCliente(50);
    const res = await postVenta(
      tx,
      configPuntos,
      { items: [{ codigoItem: "PROD-001", cantidad: 1 }], metodoPago: "PUNTOS_MONEDERO", idCliente: "CLI-1" }
    );
    expect(res.status).toBe(201);
    const body = await res.json();

    // 15 puntos canjeados por los $14.50 de la venta.
    expect(tx.cliente.updateMany).toHaveBeenCalledWith({
      where: { idCliente: "CLI-1", puntosFidelidad: { gte: 15 } },
      data: { puntosFidelidad: { decrement: 15 } },
    });
    // La venta registra al cliente y la cabecera con método de puntos.
    expect(tx.venta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metodoPago: "PUNTOS_MONEDERO",
          idCliente: "CLI-1",
        }),
      })
    );
    // Sin ingreso a la caja (los puntos no son efectivo).
    expect(tx.sesionCaja.update).not.toHaveBeenCalled();
    // El ticket envía el nombre del cliente.
    expect(body.nombreCliente).toBe("María López");
    expect(body.metodoPago).toBe("PUNTOS_MONEDERO");
  });

  it("elimina el crédito de tienda: el método ya no está habilitado", async () => {
    // El "Crédito de tienda" se retiró en la Fase 12 (reemplazado por el
    // Monedero de Puntos): el endpoint lo rechaza con 403.
    const tx = txConCliente(0);
    const res = await postVenta(
      tx,
      configPuntos,
      { items: [{ codigoItem: "PROD-001", cantidad: 9 }], metodoPago: "CREDITO_TIENDA", idCliente: "CLI-1" }
    );
    expect(res.status).toBe(403);
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("acumula puntos con la tasa configurable en cualquier venta con cliente", async () => {
    // 9 × $12.50 = $112.50 → +16% = $130.50 → piso(130.5/100) = 1 punto.
    const tx = txConCliente(0);
    const res = await postVenta(
      tx,
      configPuntos,
      { items: [{ codigoItem: "PROD-001", cantidad: 9 }], metodoPago: "EFECTIVO", idCliente: "CLI-1" }
    );
    expect(res.status).toBe(201);

    expect(tx.cliente.update).toHaveBeenCalledWith({
      where: { idCliente: "CLI-1" },
      data: { puntosFidelidad: { increment: 1 } },
    });
    // El importe sí ingresa a la caja (ya no existe el fiado).
    expect(tx.sesionCaja.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { totalVentasEfectivo: { increment: 130.5 } },
      })
    );
  });

  it("no acumula puntos si la venta no tiene cliente", async () => {
    const tx = txConCliente(0);
    const res = await postVenta(
      tx,
      configPuntos,
      { items: [{ codigoItem: "PROD-001", cantidad: 9 }], metodoPago: "EFECTIVO" }
    );
    expect(res.status).toBe(201);
    expect(tx.cliente.update).not.toHaveBeenCalled();
  });

  describe("POST /api/ventas · Precio de mayoreo (Fase 12)", () => {
    it("cobra el precio de mayoreo cuando la venta va a mayoreo", async () => {
      const tx = txConCliente(0, { precioMayoreo: 10 });
      const res = await postVenta(tx, configPuntos, {
        items: [{ codigoItem: "PROD-001", cantidad: 2 }],
        metodoPago: "EFECTIVO",
        esMayoreo: true,
      });
      expect(res.status).toBe(201);
      // 2 × $10.00 = $20.00 → +16% = $23.20 (menudeo habría sido $29.00).
      expect(tx.sesionCaja.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { totalVentasEfectivo: { increment: 23.2 } },
        })
      );
      expect(tx.lineaDetalleVenta.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ precioMomento: 10, cantidad: 2 }),
        })
      );
    });

    it("cobra menudeo si el producto no tiene precio de mayoreo", async () => {
      const tx = txConCliente(0);
      const res = await postVenta(tx, configPuntos, {
        items: [{ codigoItem: "PROD-001", cantidad: 2 }],
        metodoPago: "EFECTIVO",
        esMayoreo: true,
      });
      expect(res.status).toBe(201);
      // Sin precioMayoreo cae al precio de lista: $12.50.
      expect(tx.sesionCaja.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { totalVentasEfectivo: { increment: 29 } },
        })
      );
    });

    it("ignora esMayoreo con valores que no son booleanos", async () => {
      const tx = txConCliente(0);
      const res = await postVenta(tx, configPuntos, {
        items: [{ codigoItem: "PROD-001", cantidad: 2 }],
        metodoPago: "EFECTIVO",
        esMayoreo: "true",
      } as any);
      expect(res.status).toBe(201);
      expect(tx.sesionCaja.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { totalVentasEfectivo: { increment: 29 } },
        })
      );
    });
  });

  it("registra en bitácora cuántos puntos se canjearon", async () => {
    const tx = txConCliente(50);
    await postVenta(
      tx,
      configPuntos,
      { items: [{ codigoItem: "PROD-001", cantidad: 1 }], metodoPago: "PUNTOS_MONEDERO", idCliente: "CLI-1" }
    );
    expect(tx.bitacoraLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jsonPayload: expect.objectContaining({ puntosCanjeados: 15 }),
        }),
      })
    );
  });
});