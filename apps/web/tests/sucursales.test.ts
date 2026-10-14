import { describe, expect, it, vi } from "vitest";
import { conStockDeSucursal, moverStock } from "@/lib/existencias";
import { ejecutarTraspaso, TraspasoError } from "@/lib/traspasos";

// ============================================================
// Paso 5: existencias por sucursal, total del negocio y traspasos.
// ============================================================

function txStock(existenciaCount = 1) {
  return {
    existencia: {
      updateMany: vi.fn(async () => ({ count: existenciaCount })),
      upsert: vi.fn(async () => ({})),
      findMany: vi.fn(async () => [{ codigoItem: "A", stock: 3 }]),
    },
    producto: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as any;
}

describe("moverStock", () => {
  it("una salida descuenta la sucursal (sin sobregirar) y el total", async () => {
    const tx = txStock();
    expect(await moverStock(tx, { codigoItem: "A", delta: -2, idSucursal: "s1", exigirDisponible: true })).toBe(true);
    expect(tx.existencia.updateMany).toHaveBeenCalledWith({
      where: { idSucursal: "s1", codigoItem: "A", stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { codigoItem: "A" },
      data: { stockActual: { decrement: 2 } },
    });
  });

  it("si la sucursal no alcanza, no toca el total", async () => {
    const tx = txStock(0);
    expect(await moverStock(tx, { codigoItem: "A", delta: -5, idSucursal: "s1", exigirDisponible: true })).toBe(false);
    expect(tx.producto.update).not.toHaveBeenCalled();
  });

  it("una entrada crea o incrementa la existencia y sube el total", async () => {
    const tx = txStock();
    await moverStock(tx, { codigoItem: "A", delta: 4, idSucursal: "s2" });
    expect(tx.existencia.upsert).toHaveBeenCalledWith({
      where: { idSucursal_codigoItem: { idSucursal: "s2", codigoItem: "A" } },
      create: { idSucursal: "s2", codigoItem: "A", stock: 4 },
      update: { stock: { increment: 4 } },
    });
    expect(tx.producto.update).toHaveBeenCalledWith({
      where: { codigoItem: "A" },
      data: { stockActual: { increment: 4 } },
    });
  });

  it("sin sucursal mueve solo el total (comportamiento anterior)", async () => {
    const tx = txStock();
    await moverStock(tx, { codigoItem: "A", delta: -1, exigirDisponible: true });
    expect(tx.producto.updateMany).toHaveBeenCalled();
    expect(tx.existencia.updateMany).not.toHaveBeenCalled();
  });

  it("muestra la existencia de la sucursal y conserva el total", async () => {
    const tx = txStock();
    const [p] = await conStockDeSucursal(tx, "s1", [{ codigoItem: "A", stockActual: 10 }]);
    expect(p).toMatchObject({ stockActual: 3, stockTotal: 10 });
  });
});

function txTraspaso(disponible = true) {
  return {
    sucursal: {
      findMany: vi.fn(async () => [
        { idSucursal: "s1", nombre: "Matriz" },
        { idSucursal: "s2", nombre: "Centro" },
      ]),
    },
    producto: {
      findUnique: vi.fn(async () => ({
        codigoItem: "A",
        descripcion: "Cuaderno",
        activo: true,
        esServicio: false,
        permiteDecimales: false,
      })),
      update: vi.fn(async () => ({})),
    },
    existencia: {
      updateMany: vi.fn(async () => ({ count: disponible ? 1 : 0 })),
      upsert: vi.fn(async () => ({})),
    },
    movimientoKardex: { createMany: vi.fn(async () => ({ count: 2 })) },
    traspaso: { create: vi.fn(async () => ({ idTraspaso: "t1" })) },
    bitacoraLog: { create: vi.fn(async () => ({})) },
  } as any;
}

describe("ejecutarTraspaso", () => {
  it("sale de origen, entra a destino y deja kardex en ambas", async () => {
    const tx = txTraspaso();
    const r = await ejecutarTraspaso(
      tx,
      { idOrigen: "s1", idDestino: "s2", items: [{ codigoItem: "A", cantidad: 3 }] },
      "u1"
    );
    expect(r.folio).toMatch(/^T-\d{8}-/);
    expect(tx.existencia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ idSucursal: "s1" }) })
    );
    expect(tx.existencia.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ idSucursal: "s2", stock: 3 }) })
    );
    // El total sale y vuelve a entrar: neto cero.
    expect(tx.producto.update).toHaveBeenNthCalledWith(1, {
      where: { codigoItem: "A" },
      data: { stockActual: { decrement: 3 } },
    });
    expect(tx.producto.update).toHaveBeenNthCalledWith(2, {
      where: { codigoItem: "A" },
      data: { stockActual: { increment: 3 } },
    });
    const kardex = tx.movimientoKardex.createMany.mock.calls[0][0].data;
    expect(kardex.map((k: any) => [k.tipo, k.idSucursal])).toEqual([
      ["SALIDA", "s1"],
      ["ENTRADA", "s2"],
    ]);
  });

  it("rechaza si el origen no tiene suficiente", async () => {
    const tx = txTraspaso(false);
    await expect(
      ejecutarTraspaso(tx, { idOrigen: "s1", idDestino: "s2", items: [{ codigoItem: "A", cantidad: 99 }] }, "u1")
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.traspaso.create).not.toHaveBeenCalled();
  });

  it("valida sucursales y cantidades", async () => {
    await expect(
      ejecutarTraspaso(txTraspaso(), { idOrigen: "s1", idDestino: "s1", items: [{ codigoItem: "A", cantidad: 1 }] }, "u1")
    ).rejects.toBeInstanceOf(TraspasoError);
    await expect(
      ejecutarTraspaso(txTraspaso(), { idOrigen: "s1", idDestino: "s2", items: [{ codigoItem: "A", cantidad: 1.5 }] }, "u1")
    ).rejects.toThrow(/entera/);
  });
});
