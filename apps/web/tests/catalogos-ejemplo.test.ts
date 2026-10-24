import { describe, expect, it } from "vitest";
import { CATALOGOS_EJEMPLO } from "@/lib/catalogos-ejemplo";
import { TIPO_NEGOCIO, type TipoNegocio } from "@/lib/business-types";
import { validarEscalas } from "@/lib/precios";
import { presetPorGiro } from "@/lib/personalizacion";

const GIROS = Object.keys(TIPO_NEGOCIO) as TipoNegocio[];

describe("catálogos de ejemplo por giro", () => {
  it("cada giro tiene su catálogo propio (ninguna ferretería vende lápices)", () => {
    for (const g of GIROS) expect(CATALOGOS_EJEMPLO[g].productos.length).toBeGreaterThanOrEqual(8);
    const ferreteria = CATALOGOS_EJEMPLO.FERRETERIA.productos.map((p) => p.descripcion.toLowerCase()).join(" ");
    expect(ferreteria).not.toMatch(/lápiz|cuaderno/);
  });

  it("los datos son válidos: códigos únicos EJ-, categorías existentes, precio ≥ costo, escalas válidas", () => {
    for (const g of GIROS) {
      const c = CATALOGOS_EJEMPLO[g];
      const codigos = c.productos.map((p) => p.codigo);
      expect(new Set(codigos).size).toBe(codigos.length);
      const categorias = new Set(c.categorias.map((x) => x.nombre));
      for (const p of c.productos) {
        expect(p.codigo).toMatch(/^EJ-[A-Z0-9-]+$/);
        expect(categorias.has(p.categoria)).toBe(true);
        expect(p.precio).toBeGreaterThan(0);
        expect(p.precio).toBeGreaterThanOrEqual(p.costo);
        if (p.escalas) expect(() => validarEscalas(p.escalas, p.precio)).not.toThrow();
        if (p.esServicio) expect(p.stock).toBe(0);
      }
    }
  });

  it("los atributos de ejemplo usan los campos de la plantilla del giro", () => {
    for (const g of GIROS) {
      const claves = new Set(presetPorGiro(g).camposProducto.map((c) => c.clave));
      for (const p of CATALOGOS_EJEMPLO[g].productos) {
        for (const k of Object.keys(p.atributos ?? {})) expect(claves.has(k), `${g}:${p.codigo}:${k}`).toBe(true);
      }
    }
  });
});
