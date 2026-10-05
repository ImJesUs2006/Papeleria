import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeSale, SaleError, ivaFraccion, sufijoFolio } from "@/lib/sales";
import { executeReturn } from "@/lib/returns";
import { calcularArqueo } from "@/lib/cash";
import {
  _reiniciarRateLimit,
  limpiarIntentos,
  registrarFallo,
  segundosBloqueado,
} from "@/lib/rate-limit";
import { puedeCobrar } from "@/lib/permisos";
import { cancelarApartado, liquidarApartado } from "@/lib/apartados-cierre";

// ============================================================
// Regresiones de la auditoría de lógica: sobreventa concurrente,
// IVA configurable, caja obligatoria, descuadre por rubro,
// devoluciones (puntos / vouchers), sync offline y login.
// ============================================================

function txVenta(producto: any, opts: { stockCount?: number } = {}) {
  return {
    producto: {
      findUnique: vi.fn(async () => producto),
      updateMany: vi.fn(async () => ({ count: opts.stockCount ?? 1 })),
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

const lapiz = {
  codigoItem: "P1",
  descripcion: "Lápiz",
  precioUnitario: 100,
  stockActual: 1,
  activo: true,
  esServicio: false,
  permiteDecimales: false,
};

describe("executeSale · blindajes", () => {
  it("revierte con 409 si otra venta tomó la última unidad (carrera)", async () => {
    const tx = txVenta(lapiz, { stockCount: 0 });
    const venta = executeSale(
      tx,
      { items: [{ codigoItem: "P1", cantidad: 1 }], metodoPago: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1" }
    );
    await expect(venta).rejects.toBeInstanceOf(SaleError);
    await expect(venta).rejects.toMatchObject({ status: 409 });
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("no permite vender sin caja abierta", async () => {
    const tx = txVenta(lapiz);
    await expect(
      executeSale(
        tx,
        { items: [{ codigoItem: "P1", cantidad: 1 }], metodoPago: "EFECTIVO" },
        { idUsuario: "u1", idCaja: null }
      )
    ).rejects.toThrow(/caja abierta/i);
    expect(tx.producto.updateMany).not.toHaveBeenCalled();
  });

  it("usa la tasa de IVA configurada por el negocio", async () => {
    const tx = txVenta(lapiz);
    const r = await executeSale(
      tx,
      { items: [{ codigoItem: "P1", cantidad: 1 }], metodoPago: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", ivaRate: 8 }
    );
    expect(r.iva).toBe(8);
    expect(r.totalNeto).toBe(108);
  });

  it("rechaza efectivo recibido menor al total", async () => {
    const tx = txVenta(lapiz);
    await expect(
      executeSale(
        tx,
        { items: [{ codigoItem: "P1", cantidad: 1 }], metodoPago: "EFECTIVO", montoRecibido: 100 },
        { idUsuario: "u1", idCaja: "c1" }
      )
    ).rejects.toThrow(/no cubre el total/);
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("ivaFraccion cae al 16% con valores inválidos y acepta 0%", () => {
    expect(ivaFraccion(undefined)).toBe(0.16);
    expect(ivaFraccion(NaN)).toBe(0.16);
    expect(ivaFraccion(150)).toBe(0.16);
    expect(ivaFraccion(0)).toBe(0);
    expect(ivaFraccion(8)).toBe(0.08);
  });

  it("genera sufijos de folio de 6 caracteres sin ambiguos", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const s = sufijoFolio();
      expect(s).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      vistos.add(s);
    }
    expect(vistos.size).toBe(500);
  });
});

describe("calcularArqueo · descuadre por rubro", () => {
  it("marca descuadre aunque un faltante de efectivo se compense con vouchers", () => {
    const r = calcularArqueo({
      fondoInicial: 500,
      totalVentasEfectivo: 1000,
      totalVentasDigital: 1000,
      totalRecargas: 0,
      efectivoDeclarado: 1000, // faltan 500
      digitalDeclarado: 1500, // sobran 500
      recargasDeclarado: 0,
    });
    expect(r.diferenciaTotal).toBe(0);
    expect(r.faltanteEfectivo).toBe(500);
    expect(r.faltanteDigital).toBe(-500);
    expect(r.descuadre).toBe(true);
  });
});

function txDevolucion(venta: any, puntosCliente = 10) {
  return {
    venta: {
      findUnique: vi.fn().mockResolvedValue(venta),
      update: vi.fn().mockResolvedValue({}),
    },
    producto: {
      findMany: vi.fn().mockResolvedValue([{ codigoItem: "P1", esServicio: false }]),
      update: vi.fn().mockResolvedValue({}),
    },
    sesionCaja: {
      findUnique: vi.fn().mockResolvedValue({ estado: "ABIERTA" }),
      update: vi.fn().mockResolvedValue({}),
    },
    devolucion: { create: vi.fn().mockResolvedValue({}) },
    movimientoKardex: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    cliente: {
      findUnique: vi.fn().mockResolvedValue({ puntosFidelidad: puntosCliente }),
      update: vi.fn().mockResolvedValue({}),
    },
    bitacoraLog: { create: vi.fn().mockResolvedValue({}) },
  } as any;
}

const ventaBase = {
  folioVenta: "F-1",
  estado: "COMPLETADA",
  metodoPago: "EFECTIVO",
  subtotal: 1000,
  iva: 160,
  lineasDetalle: [{ codigoItem: "P1", cantidad: 10, precioMomento: 100 }],
  devoluciones: [],
};

describe("executeReturn · blindajes", () => {
  it("retira los puntos que generó la compra devuelta", async () => {
    const tx = txDevolucion({ ...ventaBase, idCliente: "CLI-1" }, 10);
    await executeReturn(
      tx,
      { folioVenta: "F-1", items: [{ codigoItem: "P1", cantidad: 5 }], metodoReembolso: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", puntos: { valorPuntoPesos: 1, pesosCompraPorPunto: 100 } }
    );
    // 5 × $100 + 16% = $580 → 5 puntos generados por esa parte.
    expect(tx.cliente.update).toHaveBeenCalledWith({
      where: { idCliente: "CLI-1" },
      data: { puntosFidelidad: { decrement: 5 } },
    });
  });

  it("nunca deja el saldo de puntos en negativo", async () => {
    const tx = txDevolucion({ ...ventaBase, idCliente: "CLI-1" }, 2);
    await executeReturn(
      tx,
      { folioVenta: "F-1", items: [{ codigoItem: "P1", cantidad: 5 }], metodoReembolso: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", puntos: { valorPuntoPesos: 1, pesosCompraPorPunto: 100 } }
    );
    expect(tx.cliente.update).toHaveBeenCalledWith({
      where: { idCliente: "CLI-1" },
      data: { puntosFidelidad: { decrement: 2 } },
    });
  });

  it("un reembolso por transferencia descuenta los vouchers de la caja", async () => {
    const tx = txDevolucion(ventaBase);
    await executeReturn(
      tx,
      { folioVenta: "F-1", items: [{ codigoItem: "P1", cantidad: 1 }], metodoReembolso: "TRANSFERENCIA" },
      { idUsuario: "u1", idCaja: "c1" }
    );
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "c1" },
      data: { totalVentasDigital: { decrement: 116 } },
    });
  });

  it("devuelve el IVA con la tasa a la que se cobró la venta", async () => {
    const tx = txDevolucion({ ...ventaBase, iva: 80 }); // la venta se cobró al 8%
    const r = await executeReturn(
      tx,
      { folioVenta: "F-1", items: [{ codigoItem: "P1", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", ivaRate: 16 }
    );
    expect(r.iva).toBe(8);
    expect(r.totalNeto).toBe(108);
  });
});

describe("rate-limit de login", () => {
  beforeEach(() => _reiniciarRateLimit());

  it("bloquea al quinto fallo y libera al expirar", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) expect(registrarFallo("ana|ip", undefined, t0 + i)).toBe(false);
    expect(segundosBloqueado("ana|ip", t0 + 4)).toBe(0);
    expect(registrarFallo("ana|ip", undefined, t0 + 5)).toBe(true);
    expect(segundosBloqueado("ana|ip", t0 + 6)).toBeGreaterThan(0);
    expect(segundosBloqueado("ana|ip", t0 + 16 * 60_000)).toBe(0);
  });

  it("no mezcla llaves y se limpia tras un login correcto", () => {
    for (let i = 0; i < 4; i++) registrarFallo("ana|ip");
    expect(registrarFallo("luz|ip")).toBe(false);
    limpiarIntentos("ana|ip");
    expect(registrarFallo("ana|ip")).toBe(false);
  });
});

describe("permiso granular de cobro", () => {
  it("la administradora siempre cobra; a la cajera se le puede retirar", () => {
    expect(puedeCobrar({ rol: "ADMINISTRADORA", permisoCobrar: false })).toBe(true);
    expect(puedeCobrar({ rol: "CAJERA", permisoCobrar: true })).toBe(true);
    expect(puedeCobrar({ rol: "CAJERA" })).toBe(true);
    expect(puedeCobrar({ rol: "CAJERA", permisoCobrar: false })).toBe(false);
  });
});

describe("POST /api/ventas/sync · atomicidad y autoría", () => {
  beforeEach(() => vi.resetModules());

  async function sync(ventas: any[], sesion: { idPersona: string; rol: string }) {
    const tx = {
      venta: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({})) },
      usuario: {
        findUnique: vi.fn(async ({ where }: any) => ({ idPersona: where.idPersona, activa: true })),
      },
      producto: {
        findMany: vi.fn(async () => [
          { ...lapiz, codigoItem: "P1", stockActual: 10 },
        ]),
        update: vi.fn(async () => ({})),
      },
      lineaDetalleVenta: { create: vi.fn(async () => ({})) },
      movimientoKardex: { createMany: vi.fn(async () => ({ count: 0 })) },
      sesionCaja: {
        findFirst: vi.fn(async () => ({ idCaja: "c1" })),
        update: vi.fn(async () => ({})),
      },
      bitacoraLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      configuracionNegocio: { findUnique: vi.fn(async () => null) },
      bitacoraLog: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (cb: any) => cb(tx)),
    };
    vi.doMock("@papeleria/database", () => ({
      prisma,
      Prisma: {
        TransactionIsolationLevel: { Serializable: "Serializable" },
        PrismaClientKnownRequestError: class extends Error {},
      },
    }));
    vi.doMock("@/lib/auth", () => ({
      requireAuth: () => async () => ({ user: { ...sesion, nombre: "Test" } }),
    }));
    const { POST } = await import("@/app/api/ventas/sync/route");
    const res = await POST(
      new Request("http://localhost/api/ventas/sync", {
        method: "POST",
        body: JSON.stringify({ dispositivoId: "dev-1", ventas }),
      })
    );
    return { res, body: await res.json(), tx };
  }

  it("no persiste una venta parcial cuando falla el segundo artículo", async () => {
    const { body, tx } = await sync(
      [
        {
          idLocal: "loc-1",
          idUsuario: "u1",
          metodoPago: "EFECTIVO",
          items: [
            { codigoItem: "P1", cantidad: 1, precioMomento: 100 },
            { codigoItem: "NO-EXISTE", cantidad: 1, precioMomento: 5 },
          ],
        },
      ],
      { idPersona: "u1", rol: "CAJERA" }
    );
    expect(body.resultados).toHaveLength(1);
    expect(body.resultados[0].estado).toBe("rechazada");
    expect(tx.venta.create).not.toHaveBeenCalled();
    expect(tx.producto.update).not.toHaveBeenCalled();
  });

  it("una cajera no puede atribuir la venta a otro usuario", async () => {
    const { body, tx } = await sync(
      [
        {
          idLocal: "loc-2",
          idUsuario: "otra-persona",
          metodoPago: "EFECTIVO",
          items: [{ codigoItem: "P1", cantidad: 1, precioMomento: 100 }],
        },
      ],
      { idPersona: "u1", rol: "CAJERA" }
    );
    expect(body.resultados[0].estado).toBe("aplicada");
    expect(tx.venta.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idUsuario: "u1" }) })
    );
    expect(body.resultados[0].alertas?.join(" ")).toMatch(/Autoría reasignada/);
  });
});

function txApartado(estadoCount = 1) {
  const apartado = {
    idApartado: "apt-1",
    folio: "APT-1",
    idCliente: "CLI-1",
    estado: "PENDIENTE",
    total: 232,
    anticipo: 100,
    lineas: [
      {
        codigoItem: "P1",
        cantidad: 2,
        precioMomento: 100,
        descuentoLinea: 0,
        subtotalLinea: 200,
        producto: { esServicio: false },
      },
    ],
  };
  return {
    apartado: {
      findUnique: vi.fn(async () => apartado),
      updateMany: vi.fn(async () => ({ count: estadoCount })),
    },
    sesionCaja: {
      findUnique: vi.fn(async () => ({ estado: "ABIERTA" })),
      update: vi.fn(async () => ({})),
    },
    venta: { create: vi.fn(async () => ({})) },
    lineaDetalleVenta: { create: vi.fn(async () => ({})) },
    producto: { update: vi.fn(async () => ({})) },
    cliente: { update: vi.fn(async () => ({})) },
    movimientoKardex: { createMany: vi.fn(async () => ({ count: 0 })) },
    bitacoraLog: { create: vi.fn(async () => ({})) },
  } as any;
}

describe("apartados · liquidación y cancelación", () => {
  it("liquidar cobra solo el saldo, crea la venta y no vuelve a descontar stock", async () => {
    const tx = txApartado();
    const r = await liquidarApartado(
      tx,
      "apt-1",
      { metodoPago: "EFECTIVO" },
      { idUsuario: "u1", idCaja: "c1", pesosCompraPorPunto: 100 }
    );
    expect(r.saldoCobrado).toBe(132);
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "c1" },
      data: { totalVentasEfectivo: { increment: 132 } },
    });
    expect(tx.venta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtotal: 200, iva: 32, totalNeto: 232, idCliente: "CLI-1" }),
      })
    );
    expect(tx.producto.update).not.toHaveBeenCalled();
    expect(tx.cliente.update).toHaveBeenCalledWith({
      where: { idCliente: "CLI-1" },
      data: { puntosFidelidad: { increment: 2 } },
    });
  });

  it("no liquida dos veces el mismo apartado", async () => {
    const tx = txApartado(0);
    await expect(
      liquidarApartado(tx, "apt-1", { metodoPago: "EFECTIVO" }, { idUsuario: "u1", idCaja: "c1" })
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.venta.create).not.toHaveBeenCalled();
  });

  it("liquidar exige caja abierta", async () => {
    const tx = txApartado();
    await expect(
      liquidarApartado(tx, "apt-1", { metodoPago: "EFECTIVO" }, { idUsuario: "u1", idCaja: null })
    ).rejects.toThrow(/caja abierta/i);
    expect(tx.apartado.updateMany).not.toHaveBeenCalled();
  });

  it("cancelar reingresa el stock y registra el egreso del anticipo", async () => {
    const tx = txApartado();
    const r = await cancelarApartado(
      tx,
      "apt-1",
      { reembolsarAnticipo: true },
      { idUsuario: "u1", idCaja: "c1" }
    );
    expect(r.anticipoReembolsado).toBe(100);
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { codigoItem: "P1" },
      data: { stockActual: { increment: 2 } },
    });
    expect(tx.movimientoKardex.createMany).toHaveBeenCalled();
    expect(tx.sesionCaja.update).toHaveBeenCalledWith({
      where: { idCaja: "c1" },
      data: { totalEgresos: { increment: 100 } },
    });
  });

  it("cancelar sin reembolso no toca la caja", async () => {
    const tx = txApartado();
    const r = await cancelarApartado(
      tx,
      "apt-1",
      { reembolsarAnticipo: false },
      { idUsuario: "u1", idCaja: null }
    );
    expect(r.anticipoReembolsado).toBe(0);
    expect(tx.sesionCaja.update).not.toHaveBeenCalled();
  });
});
