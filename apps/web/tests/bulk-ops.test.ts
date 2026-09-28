import { describe, expect, it } from "vitest";
import {
  aplicarAjustePrecio,
  aplicarAjusteMontoFijo,
  calcularAjustePrecios,
  validarCodigosSeleccion,
  AJUSTE_PORCENTAJE_MIN,
  AJUSTE_PORCENTAJE_MAX,
  AJUSTE_MONTO_MAX,
} from "@/lib/bulk-ops";

describe("aplicarAjustePrecio", () => {
  it("incrementa un porcentaje y redondea a 2 decimales", () => {
    expect(aplicarAjustePrecio(100, 10)).toBe(110);
    expect(aplicarAjustePrecio(12.34, 10)).toBe(13.57);
  });

  it("decrementa un porcentaje", () => {
    expect(aplicarAjustePrecio(80, -25)).toBe(60);
  });

  it("nunca devuelve negativo", () => {
    expect(aplicarAjustePrecio(10, -100)).toBe(0);
  });
});

describe("calcularAjustePrecios", () => {
  const productos = [
    { codigoItem: "A", precioUnitario: 100, precioCompra: 40 },
    { codigoItem: "B", precioUnitario: 50, precioCompra: null },
    { codigoItem: "C", precioUnitario: 10, precioCompra: 12 },
  ];

  it("aplica el ajuste a los productos que respetan la invariante de costo", () => {
    const r = calcularAjustePrecios(productos, 20);

    expect(r.aplicados).toEqual([
      { codigoItem: "A", precioAnterior: 100, precioNuevo: 120 },
      { codigoItem: "B", precioAnterior: 50, precioNuevo: 60 },
      // C (10→12) queda IGUAL al costo (no menor): se permite.
      { codigoItem: "C", precioAnterior: 10, precioNuevo: 12 },
    ]);
    expect(r.omitidos).toHaveLength(0);
  });

  it("la invariante aplica también a los recortes de precio", () => {
    // Bajar 50% de 10 = 5, y compra vale 12: debe omitirse, NO vender a pérdida.
    const r = calcularAjustePrecios(productos, -50);
    expect(r.aplicados.map((a) => a.codigoItem)).toEqual(["A", "B"]);
    expect(r.omitidos.map((o) => o.codigoItem)).toContain("C");
  });

  it("omite productos cuyo precio no cambia", () => {
    const r = calcularAjustePrecios(productos, 0);
    expect(r.aplicados).toHaveLength(0);
    // A y B no cambian; C se omite por quedar bajo su costo (10 < 12), no por "sin cambio".
    const sinCambio = r.omitidos.filter((o) => o.motivo === "Sin cambio");
    expect(sinCambio.map((o) => o.codigoItem).sort()).toEqual(["A", "B"]);
    expect(r.omitidos.some((o) => o.codigoItem === "C" && /compra/i.test(o.motivo))).toBe(
      true
    );
  });

  it("rechaza porcentajes fuera de rango", () => {
    expect(() => calcularAjustePrecios(productos, AJUSTE_PORCENTAJE_MIN - 1)).toThrow();
    expect(() => calcularAjustePrecios(productos, AJUSTE_PORCENTAJE_MAX + 1)).toThrow();
    expect(() => calcularAjustePrecios(productos, NaN)).toThrow();
  });

  it("maneja productos sin precio de compra (nunca bloqueable)", () => {
    const r = calcularAjustePrecios(
      [{ codigoItem: "X", precioUnitario: 100, precioCompra: null }],
      2000
    );
    expect(r.aplicados).toHaveLength(1);
    expect(r.aplicados[0].precioNuevo).toBe(2100);
  });
});

describe("aplicarAjusteMontoFijo", () => {
  it("suma un monto fijo redondeado a 2 decimales", () => {
    expect(aplicarAjusteMontoFijo(100, 5)).toBe(105);
    expect(aplicarAjusteMontoFijo(12.34, 0.66)).toBe(13);
  });

  it("resta un monto fijo", () => {
    expect(aplicarAjusteMontoFijo(80, -25)).toBe(55);
  });

  it("nunca devuelve negativo", () => {
    expect(aplicarAjusteMontoFijo(10, -50)).toBe(0);
  });
});

describe("calcularAjustePrecios (monto fijo)", () => {
  const productos = [
    { codigoItem: "A", precioUnitario: 100, precioCompra: 40 },
    { codigoItem: "B", precioUnitario: 50, precioCompra: null },
    { codigoItem: "C", precioUnitario: 10, precioCompra: 12 },
  ];

  it("aplica un incremento fijo respetando la invariante de costo", () => {
    const r = calcularAjustePrecios(productos, { tipo: "MONTO_FIJO", valor: 15 });
    expect(r.aplicados).toEqual([
      { codigoItem: "A", precioAnterior: 100, precioNuevo: 115 },
      { codigoItem: "B", precioAnterior: 50, precioNuevo: 65 },
      { codigoItem: "C", precioAnterior: 10, precioNuevo: 25 },
    ]);
    expect(r.omitidos).toHaveLength(0);
  });

  it("la invariante de costo aplica a los descuentos fijos", () => {
    // Descontar $95: A (100 → 5) queda bajo su compra (40) → omitido.
    // B (50 → 0 clampeado; no tiene compra) sí se aplica.
    // C (10 → 0) queda bajo su compra (12) → omitido.
    const r = calcularAjustePrecios(productos, { tipo: "MONTO_FIJO", valor: -95 });
    expect(r.aplicados.map((a) => a.codigoItem)).toEqual(["B"]);
    expect(r.aplicados[0]?.precioNuevo).toBe(0); // nunca negativo
    expect(r.omitidos.map((o) => o.codigoItem)).toContain("A");
    expect(r.omitidos.map((o) => o.codigoItem)).toContain("C");
    expect(r.omitidos.every((o) => /compra/i.test(o.motivo))).toBe(true);
  });

  it("omite productos cuyo precio no cambia", () => {
    const r = calcularAjustePrecios(productos, { tipo: "MONTO_FIJO", valor: 0 });
    const sinCambio = r.omitidos.filter((o) => o.motivo === "Sin cambio");
    expect(sinCambio.map((o) => o.codigoItem).sort()).toEqual(["A", "B"]);
    expect(r.omitidos.some((o) => o.codigoItem === "C" && /compra/i.test(o.motivo))).toBe(true);
  });

  it("rechaza montos fuera de rango y tipos inválidos", () => {
    expect(() =>
      calcularAjustePrecios(productos, { tipo: "MONTO_FIJO", valor: AJUSTE_MONTO_MAX + 1 })
    ).toThrow(/monto fijo/i);
    expect(() =>
      calcularAjustePrecios(productos, { tipo: "MONTO_FIJO", valor: -(AJUSTE_MONTO_MAX + 1) })
    ).toThrow(/monto fijo/i);
    expect(() =>
      calcularAjustePrecios(productos, { tipo: "DESCUENTO_RARO" as any, valor: 5 })
    ).toThrow(/tipo de ajuste/i);
    expect(() =>
      calcularAjustePrecios(productos, { tipo: "MONTO_FIJO", valor: NaN })
    ).toThrow(/numérico/i);
  });

  it("mantiene retrocompatibilidad con el parámetro numérico (porcentaje)", () => {
    const r = calcularAjustePrecios(productos, 20);
    expect(r.aplicados.map((a) => a.codigoItem)).toEqual(["A", "B", "C"]);
  });
});

describe("validarCodigosSeleccion", () => {
  it("exige al menos un código", () => {
    const r = validarCodigosSeleccion([]);
    expect(r).toMatchObject({ ok: false });
  });

  it("normaliza, recorta y elimina duplicados", () => {
    const r = validarCodigosSeleccion(["A", "  A  ", "B", "", "C"]);
    expect(r.ok && r.codigos).toEqual(["A", "B", "C"]);
  });

  it("rechaza selecciones vacías tras normalizar", () => {
    expect(validarCodigosSeleccion(["   "])).toMatchObject({ ok: false });
  });

  it("rechaza lotes mayores al máximo", () => {
    const listo = Array.from({ length: 501 }, (_, i) => `P-${i}`);
    const r = validarCodigosSeleccion(listo);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("500") });
  });
});