import { describe, expect, it, vi } from "vitest";
import { consumirLotesFEFO } from "@/lib/lotes";
import { normalizarSeries, SerieError } from "@/lib/series";
import { combinaciones, sufijoCodigo, validarEjes } from "@/lib/variantes";
import { executeSale } from "@/lib/sales";

// ============================================================
// Paso 6: lotes FEFO, números de serie y variantes.
// ============================================================

describe("lotes FEFO", () => {
  it("consume primero lo que caduca antes y reparte entre lotes", async () => {
    const tx = {
      lote: {
        findMany: vi.fn(async () => [
          { idLote: "a", numeroLote: "L-ENE", cantidad: 2, caducidad: new Date(2027, 0, 31) },
          { idLote: "b", numeroLote: "L-MAR", cantidad: 10, caducidad: new Date(2027, 2, 31) },
        ]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    } as any;
    const consumo = await consumirLotesFEFO(tx, { codigoItem: "MED", idSucursal: "s1", cantidad: 5 });
    expect(consumo).toEqual([
      { numeroLote: "L-ENE", cantidad: 2, caducidad: "2027-01-31" },
      { numeroLote: "L-MAR", cantidad: 3, caducidad: "2027-03-31" },
    ]);
    // Excluye vencidos desde la consulta y ordena por caducidad.
    const args = tx.lote.findMany.mock.calls[0][0];
    expect(args.where.OR[1].caducidad.gte).toBeInstanceOf(Date);
    expect(args.orderBy[0]).toEqual({ caducidad: { sort: "asc", nulls: "last" } });
  });

  it("si un lote cambió a la vez (otra venta), sigue con el siguiente", async () => {
    const tx = {
      lote: {
        findMany: vi.fn(async () => [
          { idLote: "a", numeroLote: "L1", cantidad: 5, caducidad: null },
          { idLote: "b", numeroLote: "L2", cantidad: 5, caducidad: null },
        ]),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 }),
      },
    } as any;
    const consumo = await consumirLotesFEFO(tx, { codigoItem: "X", idSucursal: "s1", cantidad: 3 });
    expect(consumo).toEqual([{ numeroLote: "L2", cantidad: 3, caducidad: null }]);
  });
});

describe("números de serie", () => {
  it("normaliza y rechaza repetidas", () => {
    expect(normalizarSeries([" abc1 ", "", "XYZ"])).toEqual(["ABC1", "XYZ"]);
    expect(() => normalizarSeries(["A1", "a1"])).toThrow(SerieError);
  });

  it("una venta de producto con serie exige una serie por pieza", async () => {
    const tx = {
      producto: {
        findUnique: vi.fn(async () => ({
          codigoItem: "TAL",
          descripcion: "Taladro",
          precioUnitario: 1000,
          stockActual: 5,
          activo: true,
          esServicio: false,
          permiteDecimales: false,
          usaSeries: true,
        })),
      },
    } as any;
    await expect(
      executeSale(
        tx,
        { items: [{ codigoItem: "TAL", cantidad: 2, series: ["S1"] }], metodoPago: "EFECTIVO" },
        { idUsuario: "u1", idCaja: "c1" }
      )
    ).rejects.toMatchObject({ codigo: "REQUIERE_SERIES" });
  });
});

describe("variantes", () => {
  it("genera todas las combinaciones de los ejes", () => {
    const ejes = validarEjes([
      { nombre: "Talla", valores: ["CH", "M", "M"] },
      { nombre: "Color", valores: ["Rojo", "Azul marino"] },
    ]);
    expect(ejes[0].valores).toEqual(["CH", "M"]);
    expect(combinaciones(ejes)).toEqual([
      { Talla: "CH", Color: "Rojo" },
      { Talla: "CH", Color: "Azul marino" },
      { Talla: "M", Color: "Rojo" },
      { Talla: "M", Color: "Azul marino" },
    ]);
  });

  it("arma sufijos de código válidos", () => {
    expect(sufijoCodigo("Azul marino")).toBe("AZULMARINO");
    expect(sufijoCodigo("Niño")).toBe("NINO");
  });

  it("valida los ejes", () => {
    expect(() => validarEjes([])).toThrow(/1 a 3/);
    expect(() => validarEjes([{ nombre: "Talla", valores: [] }])).toThrow(/valores/);
  });
});
