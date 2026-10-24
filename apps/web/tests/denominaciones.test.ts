import { describe, expect, it } from "vitest";
import { explicarDiferencia, totalConteo, validarConteo } from "@/lib/denominaciones";

describe("conteo por denominaciones", () => {
  it("suma billetes y monedas (incluye 50 centavos y $20 en ambos)", () => {
    const conteo = validarConteo({ b500: 2, b200: "1", b20: 3, m20: 1, m10: 4, m050: 3, m1: "" });
    expect(conteo).toEqual({ b500: 2, b200: 1, b20: 3, m20: 1, m10: 4, m050: 3 });
    expect(totalConteo(conteo)).toBe(1321.5);
  });

  it("rechaza denominaciones desconocidas, piezas negativas o con decimales", () => {
    expect(() => validarConteo({ b300: 1 })).toThrow(/desconocida/);
    expect(() => validarConteo({ b100: -1 })).toThrow(/entero/);
    expect(() => validarConteo({ m5: 1.5 })).toThrow(/entero/);
    expect(() => validarConteo("1000")).toThrow();
  });

  it("explica la diferencia en palabras", () => {
    expect(explicarDiferencia(0.004, "Efectivo")).toEqual({ texto: "Efectivo: cuadra", tono: "ok" });
    expect(explicarDiferencia(20, "Efectivo")).toEqual({ texto: "Efectivo: faltan $20.00", tono: "falta" });
    expect(explicarDiferencia(-5.5, "Vouchers")).toEqual({ texto: "Vouchers: sobran $5.50", tono: "sobra" });
  });
});
