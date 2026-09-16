import { describe, expect, it, vi } from "vitest";
import { calcularDevuelto, executeReturn, ReturnError } from "@/lib/returns";

function makeVenta(overrides: any = {}) {
  return {
    folioVenta: "F-TEST-0001",
    estado: "COMPLETADA",
    lineasDetalle: [
      { codigoItem: "P001", cantidad: 2, precioMomento: 100 },
      { codigoItem: "P002", cantidad: 1, precioMomento: 50 },
    ],
    devoluciones: [],
    ...overrides,
  };
}

function makeTx(venta: any = makeVenta(), sesionEstado = "ABIERTA") {
  const tx: any = {
    venta: {
      findUnique: vi.fn().mockResolvedValue(venta),
      update: vi.fn().mockResolvedValue({}),
    },
    producto: { update: vi.fn().mockResolvedValue({}) },
    sesionCaja: {
      findUnique: vi.fn().mockResolvedValue({ estado: sesionEstado }),
      update: vi.fn().mockResolvedValue({}),
    },
    devolucion: { create: vi.fn().mockResolvedValue({}) },
    bitacoraLog: { create: vi.fn().mockResolvedValue({}) },
  };
  return tx;
}

const ctx = { idUsuario: "u1", idCaja: "caja-1" };

describe("calcularDevuelto", () => {
  it("acumula cantidades por artículo entre devoluciones", () => {
    const mapa = calcularDevuelto([
      { lineas: [{ codigoItem: "P001", cantidad: 1 }] },
      { lineas: [{ codigoItem: "P001", cantidad: 2 }, { codigoItem: "P002", cantidad: 1 }] },
    ]);
    expect(mapa.get("P001")).toBe(3);
    expect(mapa.get("P002")).toBe(1);
  });
});

describe("executeReturn (devoluciones y notas de crédito)", () => {
  it("reembolso en efectivo: totales, stock, egreso de caja y bitácora", async () => {
    const tx = makeTx();
    const r = await executeReturn(
      tx,
      { folioVenta: "F-TEST-0001", items: [{ codigoItem: "P001", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
      ctx
    );

    expect(r.subtotal).toBe(100);
    expect(r.iva).toBe(16);
    expect(r.totalNeto).toBe(116);
    expect(r.ventaCompleta).toBe(false);
    expect(r.tipo).toBe("DEVOLUCION");

    expect(tx.producto.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { codigoItem: "P001" },
        data: { stockActual: { increment: 1 } },
      })
    );
    expect(tx.sesionCaja.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { totalEgresos: { increment: 116 } } })
    );
    expect(tx.bitacoraLog.create).toHaveBeenCalled();
    expect(tx.venta.update).not.toHaveBeenCalled();
  });

  it("nota de crédito: fuerza método y no toca la caja", async () => {
    const tx = makeTx();
    const r = await executeReturn(
      tx,
      {
        folioVenta: "F-TEST-0001",
        items: [{ codigoItem: "P001", cantidad: 1 }],
        tipo: "NOTA_CREDITO",
        metodoReembolso: "EFECTIVO",
      },
      ctx
    );

    expect(r.tipo).toBe("NOTA_CREDITO");
    expect(r.metodoReembolso).toBe("NOTA_CREDITO");
    expect(tx.sesionCaja.update).not.toHaveBeenCalled();
  });

  it("marca la venta como REEMBOLSADA al devolver todo", async () => {
    const tx = makeTx();
    const r = await executeReturn(
      tx,
      {
        folioVenta: "F-TEST-0001",
        items: [
          { codigoItem: "P001", cantidad: 2 },
          { codigoItem: "P002", cantidad: 1 },
        ],
        metodoReembolso: "TRANSFERENCIA",
      },
      ctx
    );

    expect(r.ventaCompleta).toBe(true);
    expect(tx.venta.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { estado: "REEMBOLSADA" } })
    );
  });

  it("respeta devoluciones previas y rechaza exceder lo disponible", async () => {
    const venta = makeVenta({
      devoluciones: [{ lineas: [{ codigoItem: "P001", cantidad: 1 }] }],
    });
    const tx = makeTx(venta);
    await expect(
      executeReturn(
        tx,
        { folioVenta: "F-TEST-0001", items: [{ codigoItem: "P001", cantidad: 2 }], metodoReembolso: "EFECTIVO" },
        ctx
      )
    ).rejects.toBeInstanceOf(ReturnError);
  });

  it("rechaza artículos ajenos a la venta", async () => {
    const tx = makeTx();
    await expect(
      executeReturn(
        tx,
        { folioVenta: "F-TEST-0001", items: [{ codigoItem: "NO-EXISTE", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        ctx
      )
    ).rejects.toThrow(/no pertenece a esta venta/);
  });

  it("rechaza método de reembolso inválido", async () => {
    const tx = makeTx();
    await expect(
      executeReturn(
        tx,
        { folioVenta: "F-TEST-0001", items: [{ codigoItem: "P001", cantidad: 1 }], metodoReembolso: "BITCOIN" },
        ctx
      )
    ).rejects.toThrow(/Método de reembolso inválido/);
  });

  it("rechaza venta inexistente (404) y cancelada (409)", async () => {
    await expect(
      executeReturn(
        makeTx(null),
        { folioVenta: "NOPE", items: [{ codigoItem: "P001", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        ctx
      )
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      executeReturn(
        makeTx(makeVenta({ estado: "CANCELADA" })),
        { folioVenta: "F-TEST-0001", items: [{ codigoItem: "P001", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        ctx
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rechaza reembolso en efectivo si la caja no está abierta", async () => {
    const tx = makeTx(makeVenta(), "CERRADA");
    await expect(
      executeReturn(
        tx,
        { folioVenta: "F-TEST-0001", items: [{ codigoItem: "P001", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        ctx
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rechaza reembolso en efectivo si no hay ninguna caja abierta", async () => {
    const tx = makeTx();
    await expect(
      executeReturn(
        tx,
        { folioVenta: "F-TEST-0001", items: [{ codigoItem: "P001", cantidad: 1 }], metodoReembolso: "EFECTIVO" },
        { idUsuario: "u1", idCaja: null }
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rechaza devolución sin artículos", async () => {
    const tx = makeTx();
    await expect(
      executeReturn(tx, { folioVenta: "F-TEST-0001", items: [], metodoReembolso: "EFECTIVO" }, ctx)
    ).rejects.toThrow(/No hay artículos por devolver/);
  });
});
