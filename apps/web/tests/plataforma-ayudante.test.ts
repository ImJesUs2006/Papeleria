import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { claveValida, firmarSesionPlataforma, plataformaHabilitada, sesionPlataformaValida } from "@/lib/plataforma";
import { pasosDe, PRIMEROS_PASOS, TEMA_GENERAL, TEMAS, temaPara } from "@/lib/ayudante";
import { nivelModulo, PRESETS_POR_NEGOCIO, TIPO_NEGOCIO, type TipoNegocio } from "@/lib/business-types";

const CLAVE = "clave-de-plataforma-de-prueba-123";

describe("consola de plataforma", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sin PLATAFORMA_TOKEN (o corto) queda deshabilitada y nada es válido", async () => {
    vi.stubEnv("PLATAFORMA_TOKEN", "corta");
    expect(plataformaHabilitada()).toBe(false);
    expect(claveValida("corta")).toBe(false);
    vi.stubEnv("PLATAFORMA_TOKEN", CLAVE);
    const token = await firmarSesionPlataforma();
    vi.stubEnv("PLATAFORMA_TOKEN", "");
    expect(await sesionPlataformaValida(token)).toBe(false);
  });

  it("valida la clave exacta y firma una sesión propia", async () => {
    vi.stubEnv("PLATAFORMA_TOKEN", CLAVE);
    expect(claveValida(CLAVE)).toBe(true);
    expect(claveValida(`${CLAVE}x`)).toBe(false);
    expect(claveValida(undefined)).toBe(false);
    expect(await sesionPlataformaValida(await firmarSesionPlataforma())).toBe(true);
    expect(await sesionPlataformaValida("token.falso.x")).toBe(false);
  });
});

describe("ayudante con guiones", () => {
  it("elige el tema por módulo (incluye subrutas) y cae al general", () => {
    expect(temaPara("/cobro").titulo).toBe("Cobro");
    expect(temaPara("/inventario/algo").titulo).toBe("Inventario");
    expect(temaPara("/cobrox")).toBe(TEMA_GENERAL);
    expect(temaPara("/desconocido")).toBe(TEMA_GENERAL);
  });

  it("las preguntas tienen id único y respuesta", () => {
    const todas = [TEMA_GENERAL, ...TEMAS].flatMap((t) => t.preguntas);
    expect(new Set(todas.map((p) => p.id)).size).toBe(todas.length);
    for (const p of todas) expect(p.respuesta.length).toBeGreaterThan(0);
  });

  it("la cajera solo ve los pasos de caja y venta", () => {
    expect(pasosDe("ADMINISTRADORA")).toHaveLength(PRIMEROS_PASOS.length);
    expect(pasosDe("CAJERA").map((p) => p.id)).toEqual(["caja", "venta", "corte"]);
  });
});

describe("módulos por giro", () => {
  it("lo que no aplica a un giro tampoco viene encendido en su plantilla", () => {
    for (const g of Object.keys(TIPO_NEGOCIO) as TipoNegocio[]) {
      for (const [flag, on] of Object.entries(PRESETS_POR_NEGOCIO[g].featureFlags)) {
        if (nivelModulo(g, flag as any) === "no_aplica") expect(on, `${g}.${flag}`).toBe(false);
      }
    }
    expect(nivelModulo("SERVICIOS", "lotesSeries")).toBe("no_aplica");
    expect(nivelModulo("FARMACIA", "lotesSeries")).toBe("recomendado");
  });
});
