import { describe, expect, it } from "vitest";
import {
  RFC_CLIENTE_SCHEMA,
  RAZON_SOCIAL_SCHEMA,
  RFC_REGEX,
  tieneDatosFiscales,
} from "@/lib/cliente-fiscal";

/**
 * FASE 12 · Padrón de clientes con datos fiscales.
 * El RFC se valida igual que en la configuración del negocio.
 */
describe("RFC_CLIENTE_SCHEMA", () => {
  it("acepta RFC de persona física (13) y moral (12)", () => {
    expect(RFC_CLIENTE_SCHEMA.parse("GACM8401018P4")).toBe("GACM8401018P4");
    expect(RFC_CLIENTE_SCHEMA.parse("XAXX010101000")).toBe("XAXX010101000");
    expect(RFC_CLIENTE_SCHEMA.parse("AAA010101AAA")).toBe("AAA010101AAA");
  });

  it("normaliza a mayúsculas", () => {
    expect(RFC_CLIENTE_SCHEMA.parse("gacm8401018p4")).toBe("GACM8401018P4");
  });

  it("convierte vacío y null en null", () => {
    expect(RFC_CLIENTE_SCHEMA.parse("")).toBeNull();
    expect(RFC_CLIENTE_SCHEMA.parse(null)).toBeNull();
    expect(RFC_CLIENTE_SCHEMA.parse(undefined)).toBeNull();
  });

  it("rechaza formatos inválidos", () => {
    expect(RFC_CLIENTE_SCHEMA.safeParse("ABCDEF").success).toBe(false);
    expect(RFC_CLIENTE_SCHEMA.safeParse("GACM8401018P44").success).toBe(false);
    expect(RFC_CLIENTE_SCHEMA.safeParse("GACM 840101 8P4").success).toBe(false);
  });

  it("acepta los RFC genéricos del SAT (XAXX / XXXX)", () => {
    expect(RFC_REGEX.test("XAXX010101000")).toBe(true);
  });
});

describe("RAZON_SOCIAL_SCHEMA", () => {
  it("normaliza vacío a null y recorta espacios", () => {
    expect(RAZON_SOCIAL_SCHEMA.parse("")).toBeNull();
    expect(RAZON_SOCIAL_SCHEMA.parse(null)).toBeNull();
    expect(RAZON_SOCIAL_SCHEMA.parse("  SA de CV  ")).toBe("SA de CV");
  });

  it("rechaza textos excesivamente largos", () => {
    expect(RAZON_SOCIAL_SCHEMA.safeParse("x".repeat(121)).success).toBe(false);
  });
});

describe("tieneDatosFiscales (regla de facturación)", () => {
  it("exige RFC o razón social", () => {
    expect(tieneDatosFiscales({ rfc: "GACM8401018P4" })).toBe(true);
    expect(tieneDatosFiscales({ razonSocial: "SA de CV" })).toBe(true);
    expect(tieneDatosFiscales({})).toBe(false);
    expect(tieneDatosFiscales({ rfc: null, razonSocial: null })).toBe(false);
    expect(tieneDatosFiscales({ rfc: "", razonSocial: "" })).toBe(false);
    expect(tieneDatosFiscales({ rfc: "   " })).toBe(false);
  });
});