import { describe, expect, it } from "vitest";
import { validateConfigInput } from "@/lib/validate-config";

function baseConfig(datosFiscales: Record<string, unknown>) {
  return {
    nombreNegocio: "Papelería El Lápiz",
    tipoNegocio: "PAPELERIA_RETAIL",
    moneda: "MXN",
    ivaRate: 16,
    featureFlags: {
      inventario: true,
      facturacion: true,
      dashboard: true,
      proveedores: true,
      bitacora: true,
    },
    metodosPago: ["EFECTIVO", "TRANSFERENCIA"],
    datosFiscales,
  };
}

// ============================================================
// Fase 11 — Validaciones SAT (Régimen 601/612/626, Uso G03/P01,
// RFC físico/moral, CURP y dirección fragmentada).
// ============================================================
describe("validateConfigInput · RFC SAT", () => {
  it("acepta RFC de persona física (13 caracteres, genérico de público general)", () => {
    const r = validateConfigInput(baseConfig({ rfc: "XAXX010101000" }));
    expect(r.success).toBe(true);
  });

  it("acepta RFC de persona física con homoclave", () => {
    const r = validateConfigInput(baseConfig({ rfc: "GACM8401018P4" }));
    expect(r.success).toBe(true);
  });

  it("acepta RFC de persona moral (12 caracteres)", () => {
    const r = validateConfigInput(baseConfig({ rfc: "AAA010101AAA" }));
    expect(r.success).toBe(true);
  });

  it("rechaza RFC con formato inválido", () => {
    const r = validateConfigInput(baseConfig({ rfc: "ABCDEF" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("RFC");
  });
});

describe("validateConfigInput · CURP SAT", () => {
  it("acepta una CURP válida", () => {
    const r = validateConfigInput(baseConfig({ curp: "GARC001101HDFRRL09" }));
    expect(r.success).toBe(true);
  });

  it("rechaza CURP con formato inválido", () => {
    const r = validateConfigInput(baseConfig({ curp: "12345" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("CURP");
  });
});

describe("validateConfigInput · catálogos SAT", () => {
  it("acepta régimen 601, 612 y 626", () => {
    expect(validateConfigInput(baseConfig({ regimenFiscal: "601" })).success).toBe(true);
    expect(validateConfigInput(baseConfig({ regimenFiscal: "612" })).success).toBe(true);
    expect(validateConfigInput(baseConfig({ regimenFiscal: "626" })).success).toBe(true);
  });

  it("acepta código + descripción (retrocompatibilidad)", () => {
    const r = validateConfigInput(
      baseConfig({ regimenFiscal: "601 - General de Ley Personas Morales" })
    );
    expect(r.success).toBe(true);
  });

  it("rechaza un régimen inexistente en el catálogo", () => {
    const r = validateConfigInput(baseConfig({ regimenFiscal: "999" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Régimen fiscal");
  });

  it("acepta uso de CFDI G03 (gastos) y P01 (por definir)", () => {
    expect(validateConfigInput(baseConfig({ usoCFDI: "G03" })).success).toBe(true);
    expect(validateConfigInput(baseConfig({ usoCFDI: "P01" })).success).toBe(true);
  });

  it("rechaza un uso de CFDI inexistente", () => {
    const r = validateConfigInput(baseConfig({ usoCFDI: "ZZZ" }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain("Uso de CFDI");
  });
});

describe("validateConfigInput · dirección fragmentada", () => {
  it("acepta dirección completa con C.P. de 5 dígitos", () => {
    const r = validateConfigInput(
      baseConfig({
        calle: "Av. Revolución",
        numExt: "12A",
        numInt: "2",
        colonia: "Centro",
        municipio: "Cuauhtémoc",
        estado: "CDMX",
        cp: "06600",
      })
    );
    expect(r.success).toBe(true);
  });

  it("rechaza C.P. que no son 5 dígitos", () => {
    const r = validateConfigInput(
      baseConfig({ calle: "Av. Revolución", numExt: "12", cp: "660" })
    );
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/c[oó]digo postal/i);
  });

  it("rechaza número exterior con caracteres no permitidos", () => {
    const r = validateConfigInput(baseConfig({ calle: "Calle", numExt: "12 A/B!" }));
    expect(r.success).toBe(false);
  });
});