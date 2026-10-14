import { describe, expect, it } from "vitest";
import {
  MODULOS_INFO,
  PRESETS_POR_NEGOCIO,
  TIPO_NEGOCIO,
  VALID_FLAG_KEYS,
  type TipoNegocio,
} from "@/lib/business-types";
import { presetPorGiro } from "@/lib/personalizacion";

const GIROS = Object.keys(TIPO_NEGOCIO) as TipoNegocio[];

describe("plantillas por giro", () => {
  it("cada giro trae plantilla completa de módulos y al menos un método de pago", () => {
    for (const giro of GIROS) {
      const p = PRESETS_POR_NEGOCIO[giro];
      expect(Object.keys(p.featureFlags).sort()).toEqual([...VALID_FLAG_KEYS].sort());
      expect(p.metodosPago.length).toBeGreaterThan(0);
    }
  });

  it("ningún giro arranca sin catálogo (el menú Inventario lo necesita, incluso servicios)", () => {
    for (const giro of GIROS) expect(PRESETS_POR_NEGOCIO[giro].featureFlags.inventario).toBe(true);
  });

  it("papelería resurte con proveedores y vende recargas", () => {
    const p = PRESETS_POR_NEGOCIO.PAPELERIA_RETAIL;
    expect(p.featureFlags.proveedores).toBe(true);
    expect(p.featureFlags.recargas).toBe(true);
    expect(p.usarCaducidad).toBe(false);
    expect(presetPorGiro("PAPELERIA_RETAIL").usarTipoImpresion).toBe(true);
  });

  it("farmacia exige caducidad y no vende sin existencia", () => {
    const p = PRESETS_POR_NEGOCIO.FARMACIA;
    expect(p.usarCaducidad).toBe(true);
    expect(p.politicaStockOffline).toBe("RECHAZAR");
    expect(presetPorGiro("FARMACIA").vocabulario.producto).toBe("Medicamento");
  });

  it("servicios acepta efectivo y nombra 'Servicio' a sus artículos", () => {
    expect(PRESETS_POR_NEGOCIO.SERVICIOS.metodosPago).toContain("EFECTIVO");
    expect(presetPorGiro("SERVICIOS").vocabulario.producto).toBe("Servicio");
  });

  it("los campos de cada plantilla tienen claves únicas y listas con opciones", () => {
    for (const giro of GIROS) {
      const campos = presetPorGiro(giro).camposProducto;
      expect(new Set(campos.map((c) => c.clave)).size).toBe(campos.length);
      for (const c of campos) if (c.tipo === "lista") expect(c.opciones?.length).toBeGreaterThan(0);
    }
  });

  it("todos los módulos tienen nombre y descripción para Configuración", () => {
    for (const flag of VALID_FLAG_KEYS) {
      expect(MODULOS_INFO[flag].label).toBeTruthy();
      expect(MODULOS_INFO[flag].desc).toBeTruthy();
    }
  });
});
