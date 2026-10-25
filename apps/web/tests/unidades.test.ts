import { describe, expect, it } from "vitest";
import {
  banderasDeTipo,
  controlesPermitidos,
  costoPorPieza,
  describirUnidadCompra,
  nombreUnidadCompra,
  piezasDe,
  stockSeCapturaDirecto,
  tipoDeProducto,
  UnidadError,
  validarUnidadCompra,
  validarUnidadVenta,
} from "@/lib/unidades";

// ============================================================
// Fase D: tipo de producto en dos preguntas y unidad de compra.
// ============================================================

describe("tipo de producto", () => {
  it("las dos preguntas producen banderas consistentes", () => {
    expect(banderasDeTipo("PIEZA", "SERIES")).toEqual({ permiteDecimales: false, esServicio: false, usaLotes: false, usaSeries: true });
    expect(banderasDeTipo("GRANEL", "LOTES")).toEqual({ permiteDecimales: true, esServicio: false, usaLotes: true, usaSeries: false });
    // Combinaciones imposibles caen en "ninguno".
    expect(banderasDeTipo("GRANEL", "SERIES").usaSeries).toBe(false);
    expect(banderasDeTipo("SERVICIO", "LOTES")).toEqual({ permiteDecimales: false, esServicio: true, usaLotes: false, usaSeries: false });
  });

  it("de las banderas guardadas se recuperan las dos preguntas", () => {
    expect(tipoDeProducto({ esServicio: true, usaLotes: true })).toEqual({ modo: "SERVICIO", control: "NINGUNO" });
    expect(tipoDeProducto({ permiteDecimales: true, usaLotes: true })).toEqual({ modo: "GRANEL", control: "LOTES" });
    expect(tipoDeProducto({ usaSeries: true })).toEqual({ modo: "PIEZA", control: "SERIES" });
    expect(tipoDeProducto({ grupoVariante: "PLAY" })).toEqual({ modo: "PIEZA", control: "VARIANTES" });
    expect(tipoDeProducto({})).toEqual({ modo: "PIEZA", control: "NINGUNO" });
  });

  it("cada forma de venta ofrece solo los controles que tienen sentido", () => {
    expect(controlesPermitidos("SERVICIO")).toEqual(["NINGUNO"]);
    expect(controlesPermitidos("GRANEL")).not.toContain("SERIES");
    expect(controlesPermitidos("PIEZA")).toContain("SERIES");
    expect(controlesPermitidos("PIEZA", false)).toEqual(["NINGUNO"]);
  });

  it("el stock se captura directo salvo en servicios, lotes y series", () => {
    expect(stockSeCapturaDirecto("PIEZA", "NINGUNO")).toBe(true);
    expect(stockSeCapturaDirecto("PIEZA", "VARIANTES")).toBe(true);
    expect(stockSeCapturaDirecto("PIEZA", "LOTES")).toBe(false);
    expect(stockSeCapturaDirecto("PIEZA", "SERIES")).toBe(false);
    expect(stockSeCapturaDirecto("SERVICIO", "NINGUNO")).toBe(false);
  });
});

describe("unidad de compra", () => {
  it("sin nombre o 'pieza' es una pieza", () => {
    expect(validarUnidadCompra({})).toEqual({ unidadCompra: null, piezasPorUnidad: 1 });
    expect(validarUnidadCompra({ unidadCompra: "Pieza", piezasPorUnidad: 1 })).toEqual({ unidadCompra: null, piezasPorUnidad: 1 });
  });

  it("un paquete necesita nombre y más de una pieza", () => {
    expect(validarUnidadCompra({ unidadCompra: " Paquete ", piezasPorUnidad: 24 })).toEqual({ unidadCompra: "Paquete", piezasPorUnidad: 24 });
    expect(() => validarUnidadCompra({ unidadCompra: "Caja", piezasPorUnidad: 1 })).toThrow(UnidadError);
    expect(() => validarUnidadCompra({ piezasPorUnidad: 12 })).toThrow(/cómo se llama/);
    for (const malo of [0, -3, 2.5, 20_000, "abc"]) {
      expect(() => validarUnidadCompra({ unidadCompra: "Caja", piezasPorUnidad: malo })).toThrow(UnidadError);
    }
  });

  it("convierte paquetes a piezas y el costo a costo por pieza", () => {
    expect(piezasDe(2, 24)).toBe(48);
    expect(costoPorPieza(120, 24)).toBe(5);
    expect(costoPorPieza(100, 3)).toBe(33.3333);
    expect(piezasDe(5, 1)).toBe(5);
  });

  it("textos para la pantalla", () => {
    expect(describirUnidadCompra("Paquete", 24)).toBe("Paquete de 24 piezas");
    expect(describirUnidadCompra(null, 1)).toBe("Pieza");
    expect(nombreUnidadCompra("Paquete", 2)).toBe("paquetes");
    expect(nombreUnidadCompra("Caja", 1)).toBe("caja");
    expect(nombreUnidadCompra("Rollo", 3)).toBe("rollos");
  });

  it("la unidad de venta solo aplica a granel", () => {
    expect(validarUnidadVenta("m", true)).toBe("m");
    expect(validarUnidadVenta("", true)).toBe("kg");
    expect(validarUnidadVenta("kg", false)).toBeNull();
  });
});
