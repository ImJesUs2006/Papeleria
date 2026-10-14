import { describe, expect, it } from "vitest";
import { costoPromedioPonderado } from "@/lib/compras";

// ============================================================
// Paso 7: costo promedio ponderado de las compras.
// ============================================================

describe("costoPromedioPonderado", () => {
  it("pondera la existencia previa con la compra nueva", () => {
    // 10 a $5 + 10 a $8 → $6.50
    expect(costoPromedioPonderado(10, 5, 10, 8)).toBe(6.5);
  });

  it("sin existencia o sin costo previo, toma el costo de la compra", () => {
    expect(costoPromedioPonderado(0, 5, 3, 9)).toBe(9);
    expect(costoPromedioPonderado(-2, 5, 3, 9)).toBe(9);
    expect(costoPromedioPonderado(10, null, 3, 9)).toBe(9);
  });

  it("conserva 4 decimales", () => {
    expect(costoPromedioPonderado(3, 10, 1, 11)).toBe(10.25);
    expect(costoPromedioPonderado(3, 1, 4, 2)).toBe(1.5714);
  });
});
